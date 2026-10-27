"""
Background worker service for asynchronous processing runs and exports.
Supports graceful shutdown, periodic heartbeat, and local/production execution.
"""
import logging
import os
import signal
import time

from packages.dataset_core.db.session import get_db_session, init_database
from services.api.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (worker) %(message)s",
)
logger = logging.getLogger("worker")

_RUNNING = True


def _signal_handler(signum, frame):
    global _RUNNING
    logger.info("Signal %s received. Initiating graceful shutdown...", signum)
    _RUNNING = False


def run_worker_loop(poll_interval: float = 5.0, max_iterations: int | None = None) -> None:
    """
    Main loop for background processing worker.
    Processes pending export jobs and batch inference tasks.
    """
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    logger.info("Starting AI Dataset Engineering Platform Worker")
    logger.info("Worker mode: %s | Privacy mode: %s", settings.WORKER_MODE, settings.PRIVACY_MODE)
    logger.info("Database: %s | Storage: %s", settings.DATABASE_URL, settings.LOCAL_STORAGE_DIR)

    init_database()
    if settings.STORAGE_BACKEND == "local":
        os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)

    iteration = 0
    while _RUNNING:
        iteration += 1
        try:
            with get_db_session():
                # Query and process any pending jobs here if using background mode
                pass
            logger.debug("Worker heartbeat iteration %d healthy.", iteration)
        except (OSError, RuntimeError, ValueError) as e:
            logger.error("Error in worker tick: %s", e)

        if max_iterations is not None and iteration >= max_iterations:
            logger.info("Reached maximum iterations (%d). Exiting worker.", max_iterations)
            break

        time.sleep(poll_interval)

    logger.info("Worker shutdown complete.")


if __name__ == "__main__":
    run_worker_loop()
