"""Application configuration loaded from environment variables."""

import os

from dotenv import load_dotenv

load_dotenv()


def _parse_db_url(url):
    """Extract host/name from a postgres:// URL for display purposes."""
    if not url:
        return "127.0.0.1", "financial_tracker"
    try:
        # postgresql://user:pass@host:port/dbname
        body = url.split("://", 1)[1]
        if "@" in body:
            body = body.split("@", 1)[1]
        host_port, _, name = body.partition("/")
        host = host_port.split(":", 1)[0]
        name = name.split("?", 1)[0] or "postgres"
        return host, name
    except Exception:
        return "unknown", "unknown"


class Config:
    """Base configuration.

    All secrets and database credentials come from environment variables
    (optionally defined in a .env file) so nothing is hard-coded.

    Point DATABASE_URL at a Supabase (PostgreSQL) connection string, e.g.
        postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres
    """

    APP_NAME = os.getenv("APP_NAME", "Financial Tracker")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me-in-production")

    # Database - prefer a full connection URL; individual parts are a fallback.
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = int(os.getenv("DB_PORT", "5432"))
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "financial_tracker")

    DB_HOST_DISPLAY, DB_NAME_DISPLAY = _parse_db_url(DATABASE_URL)

    # Display
    CURRENCY = os.getenv("CURRENCY", "$")


class DevelopmentConfig(Config):
    DEBUG = True


config = DevelopmentConfig
