'use strict'

/**
 * MailDev - web.js
 */

const express = require('express')
const http = require('http')
const socketio = require('socket.io')
const routes = require('./routes')
const auth = require('./auth')
const logger = require('./logger')
const path = require('path')

const web = module.exports = {}

/**
 * Keep record of all connections to close them on shutdown
 */
const connections = {}
let io

function handleConnection (socket) {
  const {remoteAddress, remotePort} = socket;
  const key = `${remoteAddress}:${remotePort}`;

  connections[key] = socket
  socket.on('close', () => delete connections[key])
}

function closeConnections () {
  for (let key in connections) {
    connections[key].destroy()
  }
}

/**
 * WebSockets
 */

function emitNewMail (socket) {
  return email => socket.emit('newMail', email)
}

function emitDeleteMail (socket) {
  return email => socket.emit('deleteMail', email)
}

function webSocketConnection (mailserver) {
  return function onConnection (socket) {
    const newHandlers = emitNewMail(socket)
    const deleteHandler = emitDeleteMail(socket)
    mailserver.on('new', newHandlers)
    mailserver.on('delete', deleteHandler)

    socket.on('disconnect', () => {
      mailserver.removeListener('new', newHandlers)
      mailserver.removeListener('delete', deleteHandler)
    })
  }
}

/**
 * Start the web server
 */

web.start = function (mailserver, {port=1080, host='0.0.0.0', user, password, basePathname='/', config.web, webIp, ip, webUser,webPass}) {
  const app = express()
  const server = http.createServer(app)

  if (user && password)
    app.use(auth(user, password))

  io = socketio({ path: path.join(basePathname, '/socket.io') })

  app.use(basePathname, express.static(path.join(__dirname, '../app')))

  routes(app, mailserver, basePathname)

  io.attach(server)
  io.on('connection', webSocketConnection(mailserver))

  server.listen(port, host)
  server.on('connection', handleConnection)

  server.on('error',  err => {
    logger.info('Could not start web server on ' + err.address + ':' + err.port + '\nPort already in use or insufficient rights to bind port')
    process.emit('SIGTERM')
  })

  logger.info('hermes webapp running at http://%s:%s', host, port)
  web.server = server;
}

web.close = new Promise((resolve, reject) => {
  if(!web.server)
    resolve();

  closeConnections();
  io.close(resolve);
});
