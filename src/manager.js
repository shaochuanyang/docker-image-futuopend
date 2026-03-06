const {
  setTimeout,
  clearTimeout
} = require('timers')
const {WebSocket} = require('ws')

const {
  STATUS,
  KEY_GETTER
} = require('./common')


class Getter {
  constructor () {
    this.reset()
  }

  reset () {
    const {promise, resolve} = Promise.withResolvers()

    this._promise = promise
    this._resolve = resolve
  }

  set (value) {
    this._resolve(value)
  }

  async get () {
    const value = await this._promise

    this.reset()

    return value
  }
}


class FutuOpenDManager {
  constructor(url, {
    terminateAfterIdle = false
  } = {}) {
    this._url = url
    this._terminateAfterIdle = terminateAfterIdle

    const getter = new Getter()
    this[KEY_GETTER] = getter

    this._init()
  }

  _resetTimer () {
    if (!this._terminateAfterIdle) {
      return
    }

    if (this._timer) {
      clearTimeout(this._timer)
    }

    this._timer = setTimeout(() => {
      if (this._ws) {
        this.terminate()
        this._ws = null
      }
    }, this._terminateAfterIdle)
  }

  _init () {
    this._ws = new WebSocket(this._url)

    const {promise, resolve} = Promise.withResolvers()
    this._readyPromise = promise

    this._ws.on('open', () => {
      resolve()
    })

    this._ws.on('message', (msg) => {
      this._resetTimer()

      const data = JSON.parse(msg)

      if (data.type === 'STATUS') {
        if (this._statusResolve) {
          this._statusResolve(data.status)
          return
        }
      }

      this[KEY_GETTER].set(data)
    })

    this._resetTimer()
  }

  async ready () {
    if (!this._ws) {
      this._init()
    }

    return this._readyPromise
  }

  _send (msg) {
    this._ws.send(JSON.stringify(msg))
    this._resetTimer()
  }

  // Initialize FutuOpenD
  init () {
    this._send({
      type: 'INIT'
    })
  }

  // Send verification code to FutuOpenD
  sendCode (code) {
    this._send({
      type: 'VERIFY_CODE',
      code
    })
  }

  // Send picture verification code to FutuOpenD
  sendPicCode (code) {
    this._send({
      type: 'VERIFY_PIC_CODE',
      code
    })
  }

  // Get the status of FutuOpenD
  async status () {
    if (!this._statusPromise) {
      const {promise, resolve} = Promise.withResolvers()

      this._statusPromise = promise
      this._statusResolve = resolve

      this._send({
        type: 'STATUS'
      })
    }

    const status = await this._statusPromise
    this._statusPromise = null

    return status
  }

  // close (...args) {
  //   this.#ws.close(...args)
  // }

  terminate () {
    this._ws.terminate()
  }
}


module.exports = {
  STATUS,
  FutuOpenDManager
}
