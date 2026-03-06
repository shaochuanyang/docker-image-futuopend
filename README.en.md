[中文版](https://github.com/shaochuanyang123/docker-image-futuopend)

# Docker Image: shaochuanyang123/moomoo_opend

[![Build Status](https://github.com/shaochuanyang123/docker-image-futuopend/actions/workflows/docker.yml/badge.svg)](https://github.com/shaochuanyang123/docker-image-futuopend/actions/workflows/docker.yml)
[![Coverage](https://codecov.io/gh/shaochuanyang123/docker-image-futuopend/branch/master/graph/badge.svg)](https://codecov.io/gh/shaochuanyang123/docker-image-futuopend)


Docker image for moomoo OpenD on CentOS 7, the one that really works and could handle SMS verification requests.

The container will start
- A FutuOpenD agent
- A websocket server which could help to check the ready status of the FutuOpenD agent and make it possible for you to provide SMS verfication code.

The image is always built with `DOCKER_DEFAULT_PLATFORM=linux/amd64` ([why?](https://stackoverflow.com/questions/71040681/qemu-x86-64-could-not-open-lib64-ld-linux-x86-64-so-2-no-such-file-or-direc)).

It can also run on ARM64 hosts (Apple Silicon / ARM Linux) via `linux/amd64` emulation mode (not a native ARM binary).


## Table of Content

- [Docker Image](#install)
- [NPM package @shaochuanyang123/moomoo_opend](#)

## Install

```sh
# Recommended (to pull an image by providing specific tag name)
docker pull shaochuanyang123/moomoo_opend:10.0.6008
```

Or

```sh
docker pull shaochuanyang123/moomoo_opend:latest
```

## Current moomoo OpenD Version

- 10.0.6008_Centos7

[Other versions](https://hub.docker.com/r/shaochuanyang123/moomoo_opend/tags)

## Usage

### Environment Variables

- **FUTU_LOGIN_ACCOUNT** `string` required, login account
- **FUTU_LOGIN_PWD** `string` optional, plaintext login password.
- **FUTU_LOGIN_PWD_MD5** `string` optional, login password ciphertext (32-bit MD5 encrypted hexadecimal).
  - At least one of `FUTU_LOGIN_PWD` and `FUTU_LOGIN_PWD_MD5` is required.
  - Supports plaintext only, or `md5 + plaintext` together.
- **FUTU_RSA_PRIVATE_KEY** `string` optional, absolute path to RSA private key file for trading API encryption.
- **FUTU_LANG** `string` defaults to `chs`
- **FUTU_LOG_LEVEL** `string` defaults to `no`, options:
  - `"no"` no log (the default value)
  - `"debug"` the most detailed
  - `"info"` less detailed
- **FUTU_IP** `string` defaults to `"0.0.0.0"`, different from the default ip binding address of the FutuOpenD cli, so that it could accept connections from other containers.
- **FUTU_PORT** `integer` the port of the FutuOpenD, defaults to `11111`
- **SERVER_PORT** `integer` the port of the websocket server, defaults to `8000`
- **FUTU_INIT_ON_START** `string="yes"` whether it will initialize the Futu OpenD agent on the start, defaults to `"yes"`
- **FUTU_SUPERVISE_PROCESS** `string="yes"` whether it will supervise the FutuOpenD process

### Docker Run: How to start the container

```sh
docker run \
--name FutuOpenD \
--platform linux/amd64 \
-e "SERVER_PORT=8081" \
-p 8081:8081 \
-p 11111:11111 \
-e "FUTU_LOGIN_ACCOUNT=$your_futu_id" \
-e "FUTU_LOGIN_PWD=$your_password_plaintext" \
# Optional: if available, pass md5 together
-e "FUTU_LOGIN_PWD_MD5=$your_password_md5" \
shaochuanyang123/moomoo_opend:latest
```

### WebSocket Server

```js
const {WebSocket} = require('ws')

const ws = new WebSocket('ws://localhost:8081')

ws.on('message', msg => {
  const data = JSON.parse(msg)

  if (data.type === 'REQUEST_PIC_CODE') {
    console.log('pic verify code path:', data.pic_verify_code_path)
    ws.send(JSON.stringify({
      type: 'VERIFY_PIC_CODE',
      code: '1234'
    }))
    return
  }

  if (data.type === 'REQUEST_CODE') {
    ws.send(JSON.stringify({
      type: 'VERIFY_CODE',
      code: '12345'
    }))
    return
  }

  if (data.type === 'STATUS') {
    console.log('status:', data.status)
    return
  }
})

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'STATUS'
  }))

  // If env FUTU_INIT_ON_START=no, we need to manually init futu
  ws.send(JSON.stringify({
    type: 'INIT'
  }))
})
```

Both downstream and upstream messages are in JSON type.

#### Downstream Messages: From Server to Client

```json
{
  "type": "REQUEST_PIC_CODE",
  "pic_verify_code_path": "/usr/src/app/bin/verify_code.png"
}
```

which means the FutuOpenD agent requires you to provide a graphic verification code, and `pic_verify_code_path` is the detected saved image path (might be `null`)

```json
{
  "type": "REQUEST_CODE"
}
```

which means the FutuOpenD agent requires you to provide an SMS verification code

```json
{
  "type": "CONNECTED"
}
```

which means the FutuOpenD agent is connected

```json
{
  "type": "STATUS",
  "status": -1
}
```

The server returns the current status to you.

```json
{
  "type": "CLOSED"
}
```

which means the FutuOpenD agent is closed

#### Upstream Messages: From Client to Server

```json
{
  "type": "INIT"
}
```

Tells the server to initialize the Futu OpenD agent, which only works when `FUTU_INIT_ON_START` is set to `'no'`

```json
{
  "type": "STATUS"
}
```

Asks the server to response the current status of the server

```json
{
  "type": "VERIFY_PIC_CODE",
  "code": "1234"
}
```

Submits the graphic verification code to Futu OpenD agent.

```json
{
  "type": "VERIFY_CODE",
  "code": "123456"
}
```

Submits the SMS verification code to Futu OpenD agent.

# @shaochuanyang123/moomoo_opend

## Install

```sh
npm i @shaochuanyang123/moomoo_opend
```

## Usage

```js
const {
  // The client manager to connect to the websocket server
  FutuOpenDManager,
  // STATUS enum of the websocket server
  STATUS,
  // To start the mock server with a mocked FutuOpenD for testing purposes
  startMockServer
} = require('@shaochuanyang123/moomoo_opend')

const kill = startMockServer({
  port
})
```



# For contributors

## How to build your own image

```sh
export VERSION=10.0.6008
export FUTU_VERSION=${VERSION}_Centos7
```

```sh
TAG=shaochuanyang123/moomoo_opend


docker build -t $TAG:$VERSION \
  --platform linux/amd64 \
  --build-arg FUTU_VERSION=$FUTU_VERSION \
  .
```

For example:

```sh
docker build -t shaochuanyang123/moomoo_opend:${VERSION} \
  --platform linux/amd64 \
  --build-arg FUTU_VERSION=${FUTU_VERSION} \
  .
```
