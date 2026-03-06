#!/usr/bin/env node

const env = require('@ostai/env')

const {
  FutuManager
} = require('./futu')

const login_account = env('FUTU_LOGIN_ACCOUNT', env.required)
const login_pwd = env('FUTU_LOGIN_PWD', null, '')
const login_pwd_md5 = env('FUTU_LOGIN_PWD_MD5', null, '')
const rsa_private_key = env('FUTU_RSA_PRIVATE_KEY', null, '')

// Removed in new versions of FutuOpenD
// const login_region = env('FUTU_LOGIN_REGION', env.required)

const lang = env('FUTU_LANG', env.required)
const log_level = env('FUTU_LOG_LEVEL', null, 'no')

const ip = env('FUTU_IP', null, '0.0.0.0')
const api_port = env('FUTU_PORT', env.integer, 11111)
const server_port = env('SERVER_PORT', env.integer, 80)
const init_on_start = env('FUTU_INIT_ON_START', env.boolean, true)
const supervise = env('FUTU_SUPERVISE_PROCESS', env.boolean, false)

const FUTU_CMD = env('FUTU_CMD', env.required)

if (!login_pwd && !login_pwd_md5) {
  throw new Error('Either FUTU_LOGIN_PWD or FUTU_LOGIN_PWD_MD5 is required')
}

new FutuManager(FUTU_CMD, {
  login_account,
  login_pwd,
  login_pwd_md5,
  rsa_private_key,
  // login_region,
  lang,
  log_level,
  ip,
  api_port,
  server_port,
  auto_init: init_on_start,
  supervise
})
