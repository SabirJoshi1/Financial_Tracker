"""Database connection helpers for PostgreSQL (Supabase).

Keeps all database logic separate from the Flask routes. Every query is run
through a cursor that is automatically closed, and transactions are committed
or rolled back consistently.
"""

from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2 import errors as pg_errors

from config import Config


def get_connection():
    """Return a new PostgreSQL connection using the configured credentials."""
    common = {"cursor_factory": psycopg2.extras.RealDictCursor}
    if Config.DATABASE_URL:
        return psycopg2.connect(Config.DATABASE_URL, **common)
    return psycopg2.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        dbname=Config.DB_NAME,
        **common,
    )


def is_db_reachable():
    """Return True when the configured database can be reached."""
    return db_status()[0]


def db_status():
    """Return (reachable: bool, error_or_none) for the configured database."""
    try:
        with db_cursor() as (_, cursor):
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True, None
    except psycopg2.Error as err:
        return False, str(err)


@contextmanager
def db_cursor():
    """Context manager yielding (connection, cursor) with cleanup on exit."""
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        yield conn, cursor
        conn.commit()
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


def is_duplicate_error(error):
    """Return True when the error is a unique-constraint violation."""
    return isinstance(error, pg_errors.UniqueViolation)
