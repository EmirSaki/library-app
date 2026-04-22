require("dotenv").config();
const winston = require("winston");
const app = require("./app");
const pool = require("./config/db");
const { closeBrowser } = require("../services/browserManager");

const PORT = process.env.PORT || 8080;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

let serverInstance = null;
let isShuttingDown = false;

async function warmDependencies() {
  try {
    logger.info("Checking PostgreSQL connection...");
    await pool.query("SELECT 1");
    logger.info("PostgreSQL connected successfully");
  } catch (error) {
    logger.error("PostgreSQL warmup failed", error);
  }
}

function startServer() {
  try {
    logger.info(`Starting server on port ${PORT}...`);

    serverInstance = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server is running and listening on port ${PORT}`);

      warmDependencies().catch((error) => {
        logger.error("Warmup process failed", error);
      });
    });

    serverInstance.keepAliveTimeout = 65000;
    serverInstance.headersTimeout = 66000;
  } catch (error) {
    logger.error("Server startup failed", error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (isShuttingDown) {
    logger.warn(`Shutdown already in progress (${signal})`);
    return;
  }

  isShuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully.`);

  try {
    if (serverInstance) {
      await new Promise((resolve) => {
        serverInstance.close(() => {
          logger.info("HTTP server closed");
          resolve();
        });
      });
    }
  } catch (error) {
    logger.error("Error while closing HTTP server", error);
  }

  try {
    await closeBrowser();
    logger.info("Browser closed");
  } catch (error) {
    logger.error("Error while closing browser", error);
  }

  try {
    await pool.end();
    logger.info("PostgreSQL pool closed");
  } catch (error) {
    logger.error("Error while closing PostgreSQL pool", error);
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  shutdown("uncaughtException");
});

startServer();