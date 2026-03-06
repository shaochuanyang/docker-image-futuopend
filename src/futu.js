const {WebSocketServer} = require('ws')
const pty = require('node-pty')
const fs = require('fs')
const {join, isAbsolute} = require('path')

const {
  STATUS,
  OutputManager
} = require('./common')


class FutuManager {
  constructor (cmd, {
    login_account,
    login_pwd,
    login_pwd_md5,
    rsa_private_key,
    lang,
    log_level,
    ip,
    api_port,
    server_port,

    // Whether to auto-init the FutuOpenD process
    auto_init = true,

    // Whether to supervise the FutuOpenD process, and restart it if it closes
    supervise = true
  }) {
    this._cmd = cmd
    this._ip = ip
    this._login_account = login_account
    this._login_pwd = login_pwd
    this._login_pwd_md5 = login_pwd_md5
    this._rsa_private_key = rsa_private_key
    this._lang = lang
    this._log_level = log_level
    this._api_port = api_port
    this._status = STATUS.ORIGIN
    this._supervise = supervise
    this._pic_verify_code_path = null
    this._recent_output = ''
    this._retry = parseInt(
      // For testing purposes
      process.env.FUTU_RETRY,
      10
    ) || 0

    this._should_log = log_level !== 'no'

    this._ws = new WebSocketServer({port: server_port}, () => {
      this._log(`WebSocket server is listening on port ${server_port}`)
    })

    this._clients = []

    this._ws.on('connection', ws => {
      if (this._status === STATUS.REQUESTING_VERIFICATION_CODE) {
        this._send({
          type: 'REQUEST_CODE'
        }, [ws])
      }

      if (this._status === STATUS.REQUESTING_PICTURE_VERIFICATION_CODE) {
        this._send({
          type: 'REQUEST_PIC_CODE',
          pic_verify_code_path: this._pic_verify_code_path
        }, [ws])
      }

      if (this._status === STATUS.CONNECTED) {
        this._send({
          type: 'CONNECTED'
        }, [ws])
      }

      this._clients.push(ws)
      ws.on('error', err => {
        this._error('ws error:', err)
      })

      ws.on('message', msg => {
        const payload = JSON.parse(msg)
        const {
          type,
          code
        } = payload

        if (type === 'VERIFY_CODE') {
          this.verify_code(code)
          return
        }

        if (type === 'VERIFY_PIC_CODE') {
          this.verify_pic_code(code)
          return
        }

        if (type === 'INIT') {
          this._init()
          return
        }

        if (type === 'STATUS') {
          this._send({
            type: 'STATUS',
            status: this._status
          }, [ws])
          return
        }
      })
    })

    this._reset_ready_to_receive_code()

    if (auto_init) {
      this._init()
    }
  }

  _log(...msg) {
    if (this._should_log) {
      console.log('[INFO]', ...msg)
    }
  }

  _error(...msg) {
    if (this._should_log) {
      console.error('[ERROR]', ...msg)
    }
  }

  _reset_ready_to_receive_code() {
    this._ready_to_receive_code = new Promise((resolve, reject) => {
      this._resolveReadyToReceiveCode = resolve
    })
  }

  _init() {
    if (this._status >= STATUS.INIT) {
      // Already inited
      return
    }

    this._status = STATUS.INIT

    this._log('Initializing FutuOpenD with options ...', {
      ip: this._ip,
      login_account: this._login_account,
      login_pwd: '<hidden>',
      login_pwd_md5: '<hidden>',
      rsa_private_key: this._rsa_private_key ? '<configured>' : '<empty>',
      lang: this._lang,
      log_level: this._log_level,
      api_port: this._api_port
    })

    const login_args = []

    if (this._login_pwd) {
      login_args.push(`-login_pwd=${this._login_pwd}`)
    }

    if (this._login_pwd_md5) {
      login_args.push(`-login_pwd_md5=${this._login_pwd_md5}`)
    }

    if (this._rsa_private_key) {
      login_args.push(`-rsa_private_key=${this._rsa_private_key}`)
    }

    this._child = pty.spawn(this._cmd, [
      `-login_account=${this._login_account}`,
      ...login_args,
      `-lang=${this._lang}`,
      `-log_level=${this._log_level}`,
      // Ref:
      // https://openapi.futunn.com/futu-api-doc/en/opend/opend-cmd.html#7191
      `-api_ip=${this._ip}`,
      `-websocket_ip=${this._ip}`,
      `-api_port=${this._api_port}`
    ], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: {
        ...process.env,
        FUTU_RETRY: this._retry
      }
    })

    this._output = new OutputManager()

    this._child.on('data', chunk => {
      process.stdout.write(chunk)
      this._append_recent_output(chunk)
      this._output.add(chunk)

      if (
        this._status !== STATUS.REQUESTING_PICTURE_VERIFICATION_CODE
        && this._status !== STATUS.VERIFIYING_PICTURE_CODE
        && this._is_requesting_pic_verify_code(this._recent_output)
      ) {
        this._pic_verify_code_path = this._locate_pic_verify_code_path(this._recent_output)
        this._log(
          'Picture verification requested, detected path:',
          this._pic_verify_code_path || '<not found>'
        )
        this._send({
          type: 'REQUEST_PIC_CODE',
          pic_verify_code_path: this._pic_verify_code_path
        })
        this._status = STATUS.REQUESTING_PICTURE_VERIFICATION_CODE
        // Consume marker text to avoid repeatedly triggering on following chunks.
        this._recent_output = ''
        return
      }

      if (this._output.includes('req_phone_verify_code')) {
        this._send({
          type: 'REQUEST_CODE'
        })
        this._status = STATUS.REQUESTING_VERIFICATION_CODE
        this._resolveReadyToReceiveCode()
        return
      }

      if (this._output.includes('Login successful')) {
        this._send({
          type: 'CONNECTED'
        })
        this._status = STATUS.CONNECTED
        this._output.close()
      }
    })

    this._child.on('error', err => {
      this._error('FutuOpenD error:', err)
    })

    this._child.on('exit', (code, signal) => {
      this._error('FutuOpenD exited')
    })

    this._child.on('close', () => {
      this._log('FutuOpenD closed')

      this._status = STATUS.CLOSED
      this._send({
        type: 'CLOSED'
      })

      this._reset_ready_to_receive_code()

      if (this._supervise) {
        this._retry++
        this._init()
      }
    })
  }

  // Send msg to specific clients or all clients
  _send(msg, clients) {
    if (msg.type === 'REQUEST_CODE' && this._code) {
      // Already has a code
      return
    }

    if (msg.type === 'REQUEST_PIC_CODE' && this._pic_code) {
      // Already has a picture verification code
      return
    }

    if (msg.type === 'REQUEST_PIC_CODE') {
      this._log(
        'Sending REQUEST_PIC_CODE to clients, path:',
        msg.pic_verify_code_path || '<not found>'
      )
    }

    (clients || this._clients).forEach(client => {
      client.send(JSON.stringify(msg))
    })
  }

  verify_code(code) {
    this._code = code

    if (this._status === STATUS.REQUESTING_VERIFICATION_CODE) {
      this._set_verify_code()
      return
    }

    if (this._status === STATUS.CONNECTED) {
      // Already connected, no need to verify code
      return
    }

    this._ready_to_receive_code.then(() => {
      this._set_verify_code()
    })
  }

  verify_pic_code(code) {
    this._pic_code = code

    if (this._status === STATUS.REQUESTING_PICTURE_VERIFICATION_CODE) {
      this._set_pic_verify_code()
    }
  }

  _set_verify_code() {
    const code = this._code
    this._code = undefined

    // this._ready.then might be called multiple times,
    //   so we need to test the current status again
    if (this._status !== STATUS.REQUESTING_VERIFICATION_CODE) {
      return
    }

    this._status = STATUS.VERIFIYING_CODE
    this._child.write(`input_phone_verify_code -code=${code}\r`)
  }

  _set_pic_verify_code() {
    const code = this._pic_code
    this._pic_code = undefined

    if (this._status !== STATUS.REQUESTING_PICTURE_VERIFICATION_CODE) {
      return
    }

    this._status = STATUS.VERIFIYING_PICTURE_CODE
    this._child.write(`input_pic_verify_code -code=${code}\r`)
  }

  _is_requesting_pic_verify_code(content) {
    const normalized = String(content || '').toLowerCase()
    return (
      normalized.indexOf('req_pic_verify_code') > -1
      || (
        normalized.indexOf('graphic') > -1
        && normalized.indexOf('verification') > -1
      )
      || normalized.indexOf('picverifycode') > -1
      || normalized.indexOf('pic_verify_code') > -1
    )
  }

  _locate_pic_verify_code_path(chunk) {
    return (
      this._extract_pic_verify_code_path(chunk)
      || this._find_latest_pic_verify_code_file()
      || null
    )
  }

  _extract_pic_verify_code_path(chunk) {
    const quoted = chunk.match(/["']([^"']+\.(png|jpg|jpeg|bmp|gif))["']/i)
    if (quoted && quoted[1]) {
      return this._to_absolute_path(quoted[1])
    }

    const plain = chunk.match(/([A-Za-z]:\\[^\s"'`]+\.(png|jpg|jpeg|bmp|gif)|\/[^\s"'`]+\.(png|jpg|jpeg|bmp|gif))/i)
    if (plain && plain[1]) {
      return this._to_absolute_path(plain[1])
    }

    return null
  }

  _to_absolute_path(pathLike) {
    if (!pathLike) {
      return null
    }

    if (isAbsolute(pathLike)) {
      return pathLike
    }

    return join(process.cwd(), pathLike)
  }

  _find_latest_pic_verify_code_file() {
    const dirs = [
      process.cwd(),
      join(process.cwd(), 'bin'),
      '/tmp',
      '/usr/src/app',
      '/usr/src/app/bin'
    ]

    const imageExtReg = /\.(png|jpg|jpeg|bmp|gif)$/i
    const picHintReg = /(verify|captcha|pic|code)/i
    let newest = null

    dirs.forEach(dir => {
      try {
        if (!fs.existsSync(dir)) {
          return
        }

        const names = fs.readdirSync(dir)
        names.forEach(name => {
          if (!imageExtReg.test(name) || !picHintReg.test(name)) {
            return
          }

          const full = join(dir, name)
          const stat = fs.statSync(full)
          if (!stat.isFile()) {
            return
          }

          if (!newest || stat.mtimeMs > newest.mtimeMs) {
            newest = {
              path: full,
              mtimeMs: stat.mtimeMs
            }
          }
        })
      } catch (err) {
        // ignore inaccessible directories
      }
    })

    return newest ? newest.path : null
  }

  _append_recent_output(content) {
    this._recent_output += String(content || '')

    const max_length = 4000
    if (this._recent_output.length > max_length) {
      this._recent_output = this._recent_output.slice(
        this._recent_output.length - max_length
      )
    }
  }
}


module.exports = {
  FutuManager,
  STATUS
}
