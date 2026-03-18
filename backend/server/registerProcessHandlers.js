function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
}

function registerProcessHandlers({ db, server, httpsServer, logger }) {
  let shuttingDown = false;

  const shutdown = (message, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(message);

    try {
      db.close();
    } catch (error) {
      logger.error('Failed to close database', { error: error.message });
    }

    Promise.allSettled([closeServer(httpsServer), closeServer(server)]).finally(() => {
      logger.info('Server closed');
      process.exit(exitCode);
    });
  };

  process.on('SIGINT', () => shutdown('Shutting down gracefully...'));
  process.on('SIGTERM', () => shutdown('Received SIGTERM signal'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('Shutting down after uncaught exception', 1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });

  return shutdown;
}

module.exports = registerProcessHandlers;
