const {inspect} = require('util')

const STATUS = {
  CLOSED: -2,
  ORIGIN: -1,
  INIT: 0,
  REQUESTING_VERIFICATION_CODE: 1,
  VERIFIYING_CODE: 2,
  CONNECTED: 3
}

const KEY_GETTER = Symbol('getter')


class OutputManager {
  constructor () {
    this._output = ''
    this._closed = false
    this._max = 200
  }

  add (chunk) {
    if (this._closed) {
      return
    }

    this._output += chunk

    const {length} = this._output

    if (length > this._max) {
      this._output = this._output.slice(length - this._max)
    }
  }

  [inspect.custom] () {
    return this._output
  }

  includes (str) {
    const index = this._output.indexOf(str)

    if (!~ index) {
      return false
    }

    this._output = this._output.slice(index + str.length)
    return true
  }

  close () {
    this._output = ''
    this._closed = true
  }
}


module.exports = {
  STATUS,
  KEY_GETTER,
  OutputManager
}
