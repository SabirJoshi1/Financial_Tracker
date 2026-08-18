"""Financial Tracker - Flask application.

Single-user personal finance tracker. Renders pages and exposes a REST-style
JSON API used by the vanilla JavaScript frontend.

Security notes:
- All SQL is parameterised (no string concatenation of user input).
- Every amount is parsed and validated server-side.
- DB credentials come from environment variables (see .env.example).
"""

import csv
import io
import re
import decimal
from datetime import date, datetime

import bcrypt
import psycopg2
from flask import (
    Flask,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from flask_login import (
    LoginManager,
    UserMixin,
    current_user,
    login_user,
    login_required,
    logout_user,
)

from config import Config, config as app_config
from db import db_cursor, db_status, is_db_reachable, is_duplicate_error

app = Flask(__name__)
app.config.from_object(Config)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.secret_key = Config.SECRET_KEY

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'
login_manager.login_message_category = 'info'


class User(UserMixin):
    """User class for Flask-Login."""
    def __init__(self, id, email, full_name, username, email_confirmed):
        self.id = id
        self.email = email
        self.full_name = full_name
        self.username = username
        self.email_confirmed = email_confirmed


@login_manager.user_loader
def load_user(user_id):
    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                "SELECT id, email, full_name, username, email_confirmed FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
            if row:
                return User(
                    id=row['id'],
                    email=row['email'],
                    full_name=row['full_name'],
                    username=row['username'],
                    email_confirmed=row['email_confirmed'],
                )
    except psycopg2.Error:
        pass
    return None

MAX_AMOUNT = decimal.Decimal("999999999999.99")
DECIMAL_ZERO = decimal.Decimal("0.00")
PENNY = decimal.Decimal("0.01")

INCOME_CATEGORIES = [
    "Salary",
    "Freelance",
    "Investment",
    "Business",
    "Bonus",
    "Other Income",
]
EXPENSE_CATEGORIES = [
    "Housing",
    "Groceries",
    "Transport",
    "Dining",
    "Entertainment",
    "Shopping",
    "Utilities",
    "Insurance",
    "Healthcare",
    "Education",
    "Subscriptions",
    "Travel",
    "Other",
]
ALL_CATEGORIES = sorted(set(INCOME_CATEGORIES) | set(EXPENSE_CATEGORIES))
PAYMENT_METHODS = ["Cash", "Debit Card", "Credit Card", "Bank Transfer", "Other"]


# --------------------------------------------------------------------------
# Template helpers
# --------------------------------------------------------------------------

@app.context_processor
def inject_globals():
    return {
        "app_name": Config.APP_NAME,
        "currency": Config.CURRENCY,
        "current_year": datetime.now().year,
        "payment_methods": PAYMENT_METHODS,
        "income_categories": INCOME_CATEGORIES,
        "expense_categories": EXPENSE_CATEGORIES,
        "db_host": Config.DB_HOST_DISPLAY,
        "db_name": Config.DB_NAME_DISPLAY,
    }


# --------------------------------------------------------------------------
# Validation helpers
# --------------------------------------------------------------------------

def parse_amount(value):
    """Parse a positive money value with up to two decimal places.

    Returns a Decimal, or None when the value is missing/invalid.
    """
    if value is None:
        return None
    try:
        amount = decimal.Decimal(str(value))
    except (decimal.InvalidOperation, TypeError, ValueError):
        return None
    if not amount.is_finite():
        return None
    amount = amount.quantize(PENNY, rounding=decimal.ROUND_HALF_UP)
    if amount <= DECIMAL_ZERO or amount > MAX_AMOUNT:
        return None
    return amount


def parse_int(value, default=None):
    """Parse a value into a positive integer, or return the default."""
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return default


def parse_date(value):
    """Parse a YYYY-MM-DD date string; returns date or None."""
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def clean_text(value, max_len=255):
    """Return trimmed text, or None when empty/too long."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or len(text) > max_len:
        return None
    return text


def first_day_of_month(month, year):
    return date(year, month, 1)


def days_in_month(month, year):
    next_month = date(year + month // 12, month % 12 + 1, 1)
    return (next_month - date(year, month, 1)).days


def as_money(value):
    """Convert a Decimal/float to a rounded float for JSON output."""
    if value is None:
        return 0.0
    return float(decimal.Decimal(str(value)).quantize(PENNY))


def api_error(message, status=400):
    return jsonify({"error": message}), status


def validate_password(password):
    """Validate password meets security requirements.
    
    Requirements:
    - At least 6 characters
    - One uppercase letter
    - One lowercase letter
    - One number
    - One special character
    """
    if len(password) < 6:
        return False, "Password must be at least 6 characters long."
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r'[0-9]', password):
        return False, "Password must contain at least one number."
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\'\\:"|,.<>\/?]', password):
        return False, "Password must contain at least one special character."
    return True, None


def hash_password(password):
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def check_password(password, password_hash):
    """Check if a password matches the hash."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/login", methods=["GET", "POST"])
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        
        if not username or not password:
            return render_template("login.html", error="Please enter both username and password.")
        
        try:
            with db_cursor() as (_, cursor):
                cursor.execute(
                    "SELECT id, email, full_name, username, password_hash, email_confirmed FROM users WHERE username = %s",
                    (username,),
                )
                row = cursor.fetchone()
        except psycopg2.Error as err:
            return render_template("login.html", error="Database error. Please try again.")
        
        if not row or not check_password(password, row['password_hash']):
            return render_template("login.html", error="Invalid username or password.")
        
        user = User(
            id=row['id'],
            email=row['email'],
            full_name=row['full_name'],
            username=row['username'],
            email_confirmed=row['email_confirmed'],
        )
        login_user(user)
        return redirect(url_for('dashboard'))
    
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register_page():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        email = request.form.get("email", "").strip()
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")
        
        # Validation
        if not full_name or not email or not username or not password:
            return render_template("register.html", error="All fields are required.",
                                 full_name=full_name, email=email, username=username)
        
        if password != confirm_password:
            return render_template("register.html", error="Passwords do not match.",
                                 full_name=full_name, email=email, username=username)
        
        valid, msg = validate_password(password)
        if not valid:
            return render_template("register.html", error=msg,
                                 full_name=full_name, email=email, username=username)
        
        # Check if username or email already exists
        try:
            with db_cursor() as (_, cursor):
                cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
                if cursor.fetchone():
                    return render_template("register.html", error="Username already taken.",
                                         full_name=full_name, email=email, username=username)
                
                cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
                if cursor.fetchone():
                    return render_template("register.html", error="Email already registered.",
                                         full_name=full_name, email=email, username=username)
                
                # Create user
                password_hashed = hash_password(password)
                cursor.execute(
                    """
                    INSERT INTO users (email, full_name, username, password_hash, email_confirmed)
                    VALUES (%s, %s, %s, %s, FALSE)
                    RETURNING id, email, full_name, username, email_confirmed
                    """,
                    (email, full_name, username, password_hashed),
                )
                conn = cursor.connection
                conn.commit()
                row = cursor.fetchone()
        except psycopg2.Error as err:
            return render_template("register.html", error="Database error. Please try again.",
                                 full_name=full_name, email=email, username=username)
        
        # Auto login after registration
        user = User(
            id=row['id'],
            email=row['email'],
            full_name=row['full_name'],
            username=row['username'],
            email_confirmed=row['email_confirmed'],
        )
        login_user(user)
        return redirect(url_for('dashboard'))
    
    return render_template("register.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", active_page="dashboard")


@app.route("/transactions")
@login_required
def transactions_page():
    return render_template("transactions.html", active_page="transactions")


@app.route("/budgets")
@login_required
def budgets_page():
    return render_template("budgets.html", active_page="budgets")


@app.route("/goals")
@login_required
def goals_page():
    return render_template("goals.html", active_page="goals")


@app.route("/reports")
@login_required
def reports_page():
    return render_template("reports.html", active_page="reports")


@app.route("/settings")
@login_required
def settings_page():
    return render_template("settings.html", active_page="settings")


# --------------------------------------------------------------------------
# API - dashboard
# --------------------------------------------------------------------------

@app.route("/api/dashboard")
@login_required
def api_dashboard():
    today = date.today()
    month, year = today.month, today.year
    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS total_income,
                    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expense
                FROM transactions
                WHERE user_id = %s
                """,
                (current_user.id,),
            )
            totals = cursor.fetchone()

            cursor.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
                    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
                FROM transactions
                WHERE user_id = %s AND EXTRACT(YEAR FROM transaction_date) = %s AND EXTRACT(MONTH FROM transaction_date) = %s
                """,
                (current_user.id, year, month),
            )
            month_totals = cursor.fetchone()

            cursor.execute(
                """
                SELECT category, COALESCE(SUM(amount), 0) AS amount
                FROM transactions
                WHERE user_id = %s AND type = 'expense'
                  AND EXTRACT(YEAR FROM transaction_date) = %s AND EXTRACT(MONTH FROM transaction_date) = %s
                GROUP BY category
                ORDER BY amount DESC
                """,
                (current_user.id, year, month),
            )
            category_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT TO_CHAR(transaction_date, 'YYYY-MM') AS month,
                       COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
                       COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
                FROM transactions
                WHERE user_id = %s AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
                GROUP BY month
                ORDER BY month
                """,
                (current_user.id,),
            )
            trend_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT id, type, description, amount, category, transaction_date,
                       payment_method, notes, created_at
                FROM transactions
                WHERE user_id = %s
                ORDER BY transaction_date DESC, id DESC
                LIMIT 7
                """,
                (current_user.id,),
            )
            recent = cursor.fetchall()

            cursor.execute(
                """
                SELECT COALESCE(SUM(budget_amount), 0) AS total_budget
                FROM budgets
                WHERE user_id = %s AND month = %s AND year = %s
                """,
                (current_user.id, month, year),
            )
            budget_total = cursor.fetchone()["total_budget"]

            cursor.execute(
                """
                SELECT COALESCE(SUM(t.amount), 0) AS spent
                FROM budgets b
                LEFT JOIN transactions t
                    ON t.user_id = b.user_id
                   AND t.type = 'expense'
                   AND t.category = b.category
                   AND EXTRACT(YEAR FROM t.transaction_date) = b.year
                   AND EXTRACT(MONTH FROM t.transaction_date) = b.month
                WHERE b.user_id = %s AND b.month = %s AND b.year = %s
                """,
                (current_user.id, month, year),
            )
            budget_spent = cursor.fetchone()["spent"]
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    total_income = decimal.Decimal(totals["total_income"])
    total_expense = decimal.Decimal(totals["total_expense"])
    month_income = decimal.Decimal(month_totals["income"])
    month_expense = decimal.Decimal(month_totals["expense"])
    month_savings = month_income - month_expense
    savings_rate = float(month_savings / month_income * 100) if month_income > 0 else 0.0

    budget_total = decimal.Decimal(budget_total)
    budget_spent = decimal.Decimal(budget_spent)
    budget_remaining = budget_total - budget_spent

    labels = []
    trend_income = []
    trend_expense = []
    for row in trend_rows:
        labels.append(row["month"])
        trend_income.append(as_money(row["income"]))
        trend_expense.append(as_money(row["expense"]))

    for row in recent:
        row["amount"] = as_money(row["amount"])

    return jsonify(
        {
            "current_balance": as_money(total_income - total_expense),
            "total_income": as_money(total_income),
            "total_expense": as_money(total_expense),
            "month": {
                "income": as_money(month_income),
                "expense": as_money(month_expense),
                "savings": as_money(month_savings),
                "savings_rate": round(savings_rate, 1),
                "budget_total": as_money(budget_total),
                "budget_spent": as_money(budget_spent),
                "budget_remaining": as_money(budget_remaining),
            },
            "spending_by_category": {
                row["category"]: as_money(row["amount"]) for row in category_rows
            },
            "trend": {
                "labels": labels,
                "income": trend_income,
                "expense": trend_expense,
            },
            "recent_transactions": recent,
        }
    )


# --------------------------------------------------------------------------
# API - transactions (CRUD + filters)
# --------------------------------------------------------------------------

def build_transaction_filters(args):
    """Build a parameterised WHERE clause, params list and ORDER BY string."""
    clauses = []
    params = []

    clauses.append("user_id = %s")
    params.append(current_user.id)

    ftype = args.get("type", "").strip().lower()
    if ftype in ("income", "expense"):
        clauses.append("type = %s")
        params.append(ftype)

    category = args.get("category", "").strip()
    if category and category in ALL_CATEGORIES:
        clauses.append("category = %s")
        params.append(category)

    month = parse_int(args.get("month"))
    year = parse_int(args.get("year"))
    if month and 1 <= month <= 12:
        clauses.append("EXTRACT(MONTH FROM transaction_date) = %s")
        params.append(month)
    if year and year >= 1:
        clauses.append("EXTRACT(YEAR FROM transaction_date) = %s")
        params.append(year)

    search = args.get("search", "").strip()
    if search:
        clauses.append("(description LIKE %s OR notes LIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    sort = args.get("sort", "newest")
    order_map = {
        "newest": "transaction_date DESC, id DESC",
        "oldest": "transaction_date ASC, id ASC",
        "amount_desc": "amount DESC, transaction_date DESC",
        "amount_asc": "amount ASC, transaction_date DESC",
    }
    order = order_map.get(sort, order_map["newest"])

    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    return where, params, order


def validate_transaction_payload(data):
    """Validate payload, returning (cleaned_data, error) tuple."""
    ttype = str(data.get("type", "")).strip().lower()
    if ttype not in ("income", "expense"):
        return None, "Transaction type must be 'income' or 'expense'."

    description = clean_text(data.get("description"))
    if not description:
        return None, "Description is required (max 255 characters)."

    amount = parse_amount(data.get("amount"))
    if amount is None:
        return None, "Amount must be a positive number with up to 2 decimal places."

    categories = INCOME_CATEGORIES if ttype == "income" else EXPENSE_CATEGORIES
    category = str(data.get("category", "")).strip()
    if category not in categories:
        return None, f"Please select a valid {'income' if ttype == 'income' else 'expense'} category."

    transaction_date = parse_date(data.get("transaction_date"))
    if not transaction_date:
        return None, "A valid date (YYYY-MM-DD) is required."

    payment_method = str(data.get("payment_method", "")).strip()
    if payment_method not in PAYMENT_METHODS:
        return None, "Please select a valid payment method."

    notes = str(data.get("notes") or "").strip()[:2000]

    return {
        "type": ttype,
        "description": description,
        "amount": amount,
        "category": category,
        "transaction_date": transaction_date.isoformat(),
        "payment_method": payment_method,
        "notes": notes,
    }, None


@app.route("/api/transactions", methods=["GET"])
@login_required
def api_list_transactions():
    where, params, order = build_transaction_filters(request.args)
    limit = min(max(parse_int(request.args.get("limit"), 100), 1), 500)
    offset = max(parse_int(request.args.get("offset"), 0), 0)
    try:
        with db_cursor() as (_, cursor):
            cursor.execute(f"SELECT COUNT(*) AS count FROM transactions {where}", params)
            total = cursor.fetchone()["count"]

            cursor.execute(
                f"""
                SELECT id, type, description, amount, category, transaction_date,
                       payment_method, notes, created_at
                FROM transactions {where}
                ORDER BY {order}
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = cursor.fetchall()

            cursor.execute(
                f"""
                SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
                       COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
                FROM transactions {where}
                """,
                params,
            )
            totals = cursor.fetchone()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    for row in rows:
        row["amount"] = as_money(row["amount"])

    return jsonify(
        {
            "transactions": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
            "filters": {
                "total_income": as_money(totals["income"]),
                "total_expense": as_money(totals["expense"]),
                "net": as_money(totals["income"] - totals["expense"]),
            },
        }
    )


@app.route("/api/transactions/<int:tx_id>", methods=["GET"])
@login_required
def api_get_transaction(tx_id):
    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT id, type, description, amount, category, transaction_date,
                       payment_method, notes, created_at
                FROM transactions WHERE id = %s AND user_id = %s
                """,
                (tx_id, current_user.id),
            )
            row = cursor.fetchone()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    if not row:
        return api_error("Transaction not found.", 404)
    row["amount"] = as_money(row["amount"])
    return jsonify(row)


@app.route("/api/transactions", methods=["POST"])
@login_required
def api_create_transaction():
    data = request.get_json(silent=True)
    if data is None:
        return api_error("Request body must be valid JSON.")
    cleaned, error = validate_transaction_payload(data)
    if error:
        return api_error(error)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO transactions (user_id, type, description, amount, category,
                                          transaction_date, payment_method, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    current_user.id,
                    cleaned["type"],
                    cleaned["description"],
                    cleaned["amount"],
                    cleaned["category"],
                    cleaned["transaction_date"],
                    cleaned["payment_method"],
                    cleaned["notes"],
                ),
            )
            conn.commit()
            new_id = cursor.fetchone()["id"]
            cursor.execute(
                """
                SELECT id, type, description, amount, category, transaction_date,
                       payment_method, notes, created_at
                FROM transactions WHERE id = %s
                """,
                (new_id,),
            )
            row = cursor.fetchone()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    row["amount"] = as_money(row["amount"])
    return jsonify(row), 201


@app.route("/api/transactions/<int:tx_id>", methods=["PUT"])
@login_required
def api_update_transaction(tx_id):
    data = request.get_json(silent=True)
    if data is None:
        return api_error("Request body must be valid JSON.")
    cleaned, error = validate_transaction_payload(data)
    if error:
        return api_error(error)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT id FROM transactions WHERE id = %s AND user_id = %s", (tx_id, current_user.id))
            if not cursor.fetchone():
                return api_error("Transaction not found.", 404)
            cursor.execute(
                """
                UPDATE transactions
                SET type = %s, description = %s, amount = %s, category = %s,
                    transaction_date = %s, payment_method = %s, notes = %s
                WHERE id = %s AND user_id = %s
                """,
                (
                    cleaned["type"],
                    cleaned["description"],
                    cleaned["amount"],
                    cleaned["category"],
                    cleaned["transaction_date"],
                    cleaned["payment_method"],
                    cleaned["notes"],
                    tx_id,
                    current_user.id,
                ),
            )
            conn.commit()
            cursor.execute(
                """
                SELECT id, type, description, amount, category, transaction_date,
                       payment_method, notes, created_at
                FROM transactions WHERE id = %s AND user_id = %s
                """,
                (tx_id, current_user.id),
            )
            row = cursor.fetchone()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    row["amount"] = as_money(row["amount"])
    return jsonify(row)


@app.route("/api/transactions/<int:tx_id>", methods=["DELETE"])
@login_required
def api_delete_transaction(tx_id):
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT id FROM transactions WHERE id = %s AND user_id = %s", (tx_id, current_user.id))
            if not cursor.fetchone():
                return api_error("Transaction not found.", 404)
            cursor.execute("DELETE FROM transactions WHERE id = %s AND user_id = %s", (tx_id, current_user.id))
            conn.commit()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)
    return "", 204


# --------------------------------------------------------------------------
# API - budgets
# --------------------------------------------------------------------------

def validate_budget_payload(data):
    category = str(data.get("category", "")).strip()
    if category not in EXPENSE_CATEGORIES:
        return None, "Please select a valid expense category."

    amount = parse_amount(data.get("budget_amount"))
    if amount is None:
        return None, "Budget amount must be a positive number with up to 2 decimal places."

    month = parse_int(data.get("month"))
    year = parse_int(data.get("year"))
    if not month or not (1 <= month <= 12):
        return None, "A valid month (1-12) is required."
    if not year or year < 2000 or year > 2100:
        return None, "A valid year is required."

    return {
        "category": category,
        "budget_amount": amount,
        "month": month,
        "year": year,
    }, None


def budget_status(percent):
    if percent > 100:
        return "exceeded"
    if percent >= 90:
        return "danger"
    if percent >= 70:
        return "warn"
    return "ok"


@app.route("/api/budgets", methods=["GET"])
@login_required
def api_list_budgets():
    today = date.today()
    month = parse_int(request.args.get("month"), today.month)
    year = parse_int(request.args.get("year"), today.year)
    if not (1 <= month <= 12) or year < 2000 or year > 2100:
        return api_error("Invalid month or year.")

    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT b.id, b.category, b.budget_amount, b.month, b.year,
                       COALESCE(SUM(t.amount), 0) AS spent
                FROM budgets b
                LEFT JOIN transactions t
                    ON t.user_id = b.user_id
                   AND t.type = 'expense'
                   AND t.category = b.category
                   AND EXTRACT(YEAR FROM t.transaction_date) = b.year
                   AND EXTRACT(MONTH FROM t.transaction_date) = b.month
                WHERE b.user_id = %s AND b.month = %s AND b.year = %s
                GROUP BY b.id, b.category, b.budget_amount, b.month, b.year
                ORDER BY b.category
                """,
                (current_user.id, month, year),
            )
            rows = cursor.fetchall()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    budgets = []
    total_budget = decimal.Decimal(0)
    total_spent = decimal.Decimal(0)
    for row in rows:
        budget = decimal.Decimal(row["budget_amount"])
        spent = decimal.Decimal(row["spent"])
        remaining = budget - spent
        percent = float(spent / budget * 100) if budget > 0 else 0.0
        total_budget += budget
        total_spent += spent
        budgets.append(
            {
                "id": row["id"],
                "category": row["category"],
                "budget_amount": as_money(budget),
                "spent": as_money(spent),
                "remaining": as_money(remaining),
                "percent": round(percent, 1),
                "status": budget_status(percent),
                "month": row["month"],
                "year": row["year"],
            }
        )

    return jsonify(
        {
            "month": month,
            "year": year,
            "budgets": budgets,
            "totals": {
                "budget": as_money(total_budget),
                "spent": as_money(total_spent),
                "remaining": as_money(total_budget - total_spent),
            },
        }
    )


@app.route("/api/budgets", methods=["POST"])
@login_required
def api_create_budget():
    data = request.get_json(silent=True)
    if data is None:
        return api_error("Request body must be valid JSON.")
    cleaned, error = validate_budget_payload(data)
    if error:
        return api_error(error)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO budgets (user_id, category, budget_amount, month, year)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    current_user.id,
                    cleaned["category"],
                    cleaned["budget_amount"],
                    cleaned["month"],
                    cleaned["year"],
                ),
            )
            conn.commit()
            new_id = cursor.fetchone()["id"]
    except psycopg2.Error as err:
        if is_duplicate_error(err):
            return api_error("A budget for this category and month already exists.", 409)
        return api_error(f"Database error: {err}", 500)

    return jsonify({"id": new_id, **{k: as_money(v) if k == "budget_amount" else v
                                     for k, v in cleaned.items()}}), 201


@app.route("/api/budgets/<int:budget_id>", methods=["PUT"])
@login_required
def api_update_budget(budget_id):
    data = request.get_json(silent=True)
    if data is None:
        return api_error("Request body must be valid JSON.")
    cleaned, error = validate_budget_payload(data)
    if error:
        return api_error(error)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT id FROM budgets WHERE id = %s AND user_id = %s", (budget_id, current_user.id))
            if not cursor.fetchone():
                return api_error("Budget not found.", 404)
            cursor.execute(
                """
                UPDATE budgets
                SET category = %s, budget_amount = %s, month = %s, year = %s
                WHERE id = %s AND user_id = %s
                """,
                (
                    cleaned["category"],
                    cleaned["budget_amount"],
                    cleaned["month"],
                    cleaned["year"],
                    budget_id,
                    current_user.id,
                ),
            )
            conn.commit()
    except psycopg2.Error as err:
        if is_duplicate_error(err):
            return api_error("A budget for this category and month already exists.", 409)
        return api_error(f"Database error: {err}", 500)

    return jsonify({"id": budget_id, "updated": True})


@app.route("/api/budgets/<int:budget_id>", methods=["DELETE"])
@login_required
def api_delete_budget(budget_id):
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT id FROM budgets WHERE id = %s AND user_id = %s", (budget_id, current_user.id))
            if not cursor.fetchone():
                return api_error("Budget not found.", 404)
            cursor.execute("DELETE FROM budgets WHERE id = %s AND user_id = %s", (budget_id, current_user.id))
            conn.commit()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)
    return "", 204


# --------------------------------------------------------------------------
# API - goals
# --------------------------------------------------------------------------

def validate_goal_payload(data):
    goal_name = clean_text(data.get("goal_name"), max_len=255)
    if not goal_name:
        return None, "Goal name is required (max 255 characters)."

    target_amount = parse_amount(data.get("target_amount"))
    if target_amount is None:
        return None, "Target amount must be a positive number."

    current_amount = data.get("current_amount")
    if current_amount in (None, ""):
        current = DECIMAL_ZERO
    else:
        try:
            current = decimal.Decimal(str(current_amount)).quantize(PENNY, rounding=decimal.ROUND_HALF_UP)
        except (decimal.InvalidOperation, TypeError, ValueError):
            return None, "Current amount must be a valid number."
        if current < 0 or current > MAX_AMOUNT:
            return None, "Current amount must be between 0 and the maximum allowed."

    target_date = parse_date(data.get("target_date"))
    description = str(data.get("description") or "").strip()[:2000]

    return {
        "goal_name": goal_name,
        "target_amount": target_amount,
        "current_amount": current,
        "target_date": target_date.isoformat() if target_date else None,
        "description": description,
    }, None


@app.route("/api/goals", methods=["GET"])
@login_required
def api_list_goals():
    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT id, goal_name, target_amount, current_amount, target_date,
                       description, created_at
                FROM goals WHERE user_id = %s ORDER BY created_at DESC, id DESC
                """,
                (current_user.id,),
            )
            rows = cursor.fetchall()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    goals = []
    for row in rows:
        target = decimal.Decimal(row["target_amount"])
        current = decimal.Decimal(row["current_amount"])
        percent = float(current / target * 100) if target > 0 else 0.0
        goals.append(
            {
                "id": row["id"],
                "goal_name": row["goal_name"],
                "target_amount": as_money(target),
                "current_amount": as_money(current),
                "target_date": row["target_date"].isoformat() if row["target_date"] else None,
                "description": row["description"],
                "percent": round(min(percent, 100.0), 1),
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )
    return jsonify({"goals": goals})


@app.route("/api/goals", methods=["POST"])
@login_required
def api_create_goal():
    data = request.get_json(silent=True)
    if data is None:
        return api_error("Request body must be valid JSON.")
    cleaned, error = validate_goal_payload(data)
    if error:
        return api_error(error)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO goals (user_id, goal_name, target_amount, current_amount, target_date, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    current_user.id,
                    cleaned["goal_name"],
                    cleaned["target_amount"],
                    cleaned["current_amount"],
                    cleaned["target_date"],
                    cleaned["description"],
                ),
            )
            conn.commit()
            new_id = cursor.fetchone()["id"]
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    return jsonify({"id": new_id, "created": True}), 201


@app.route("/api/goals/<int:goal_id>", methods=["PUT"])
@login_required
def api_update_goal(goal_id):
    data = request.get_json(silent=True)
    if data is None:
        return api_error("Request body must be valid JSON.")
    cleaned, error = validate_goal_payload(data)
    if error:
        return api_error(error)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT id FROM goals WHERE id = %s AND user_id = %s", (goal_id, current_user.id))
            if not cursor.fetchone():
                return api_error("Goal not found.", 404)
            cursor.execute(
                """
                UPDATE goals
                SET goal_name = %s, target_amount = %s, current_amount = %s,
                    target_date = %s, description = %s
                WHERE id = %s AND user_id = %s
                """,
                (
                    cleaned["goal_name"],
                    cleaned["target_amount"],
                    cleaned["current_amount"],
                    cleaned["target_date"],
                    cleaned["description"],
                    goal_id,
                    current_user.id,
                ),
            )
            conn.commit()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    return jsonify({"id": goal_id, "updated": True})


@app.route("/api/goals/<int:goal_id>/contribute", methods=["POST"])
@login_required
def api_contribute_to_goal(goal_id):
    data = request.get_json(silent=True) or {}
    amount = parse_amount(data.get("amount"))
    if amount is None:
        return api_error("Contribution amount must be a positive number.")

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute(
                "SELECT id, current_amount FROM goals WHERE id = %s AND user_id = %s", (goal_id, current_user.id)
            )
            row = cursor.fetchone()
            if not row:
                return api_error("Goal not found.", 404)
            current = decimal.Decimal(row["current_amount"])
            new_current = (current + amount).quantize(PENNY, rounding=decimal.ROUND_HALF_UP)
            if new_current > MAX_AMOUNT:
                return api_error("Goal would exceed the maximum allowed amount.", 400)
            cursor.execute(
                "UPDATE goals SET current_amount = %s WHERE id = %s AND user_id = %s",
                (new_current, goal_id, current_user.id),
            )
            conn.commit()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    return jsonify({"id": goal_id, "current_amount": as_money(new_current), "added": as_money(amount)})


@app.route("/api/goals/<int:goal_id>", methods=["DELETE"])
@login_required
def api_delete_goal(goal_id):
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT id FROM goals WHERE id = %s AND user_id = %s", (goal_id, current_user.id))
            if not cursor.fetchone():
                return api_error("Goal not found.", 404)
            cursor.execute("DELETE FROM goals WHERE id = %s AND user_id = %s", (goal_id, current_user.id))
            conn.commit()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)
    return "", 204


# --------------------------------------------------------------------------
# API - reports
# --------------------------------------------------------------------------

@app.route("/api/reports", methods=["GET"])
@login_required
def api_reports():
    today = date.today()
    month = parse_int(request.args.get("month"), today.month)
    year = parse_int(request.args.get("year"), today.year)
    if not (1 <= month <= 12) or year < 2000 or year > 2100:
        return api_error("Invalid month or year.")

    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income,
                       COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
                FROM transactions
                WHERE user_id = %s AND EXTRACT(YEAR FROM transaction_date) = %s AND EXTRACT(MONTH FROM transaction_date) = %s
                """,
                (current_user.id, year, month),
            )
            totals = cursor.fetchone()

            cursor.execute(
                """
                SELECT category, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
                FROM transactions
                WHERE user_id = %s AND type = 'expense'
                  AND EXTRACT(YEAR FROM transaction_date) = %s AND EXTRACT(MONTH FROM transaction_date) = %s
                GROUP BY category
                ORDER BY amount DESC
                """,
                (current_user.id, year, month),
            )
            categories = cursor.fetchall()

            cursor.execute(
                """
                SELECT b.category, b.budget_amount,
                       COALESCE(SUM(t.amount), 0) AS spent
                FROM budgets b
                LEFT JOIN transactions t
                    ON t.user_id = b.user_id
                   AND t.type = 'expense'
                   AND t.category = b.category
                   AND EXTRACT(YEAR FROM t.transaction_date) = b.year
                   AND EXTRACT(MONTH FROM t.transaction_date) = b.month
                WHERE b.user_id = %s AND b.month = %s AND b.year = %s
                GROUP BY b.id, b.category, b.budget_amount
                ORDER BY b.category
                """,
                (current_user.id, month, year),
            )
            budget_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT transaction_date, COALESCE(SUM(amount), 0) AS amount
                FROM transactions
                WHERE user_id = %s AND type = 'expense'
                  AND EXTRACT(YEAR FROM transaction_date) = %s AND EXTRACT(MONTH FROM transaction_date) = %s
                GROUP BY transaction_date
                ORDER BY transaction_date
                """,
                (current_user.id, year, month),
            )
            daily_rows = cursor.fetchall()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    income = decimal.Decimal(totals["income"])
    expense = decimal.Decimal(totals["expense"])
    net = income - expense
    days = days_in_month(month, year)
    savings_rate = float(net / income * 100) if income > 0 else 0.0

    highest = None
    if categories:
        highest = {
            "category": categories[0]["category"],
            "amount": as_money(categories[0]["amount"]),
            "count": categories[0]["count"],
        }

    budgets = []
    budget_total = decimal.Decimal(0)
    budget_spent = decimal.Decimal(0)
    for row in budget_rows:
        budget = decimal.Decimal(row["budget_amount"])
        spent = decimal.Decimal(row["spent"])
        percent = float(spent / budget * 100) if budget > 0 else 0.0
        budget_total += budget
        budget_spent += spent
        budgets.append(
            {
                "category": row["category"],
                "budget_amount": as_money(budget),
                "spent": as_money(spent),
                "remaining": as_money(budget - spent),
                "percent": round(percent, 1),
                "status": budget_status(percent),
            }
        )

    return jsonify(
        {
            "month": month,
            "year": year,
            "month_label": f"{date(year, month, 1).strftime('%B %Y')}",
            "totals": {
                "income": as_money(income),
                "expense": as_money(expense),
                "net": as_money(net),
                "savings_rate": round(savings_rate, 1),
                "avg_daily_spending": as_money(expense / decimal.Decimal(days)) if days else 0.0,
                "days": days,
            },
            "highest_category": highest,
            "categories": [
                {"category": c["category"], "amount": as_money(c["amount"]), "count": c["count"]}
                for c in categories
            ],
            "budgets": budgets,
            "budget_totals": {
                "budget": as_money(budget_total),
                "spent": as_money(budget_spent),
                "remaining": as_money(budget_total - budget_spent),
            },
            "daily_spending": [
                {"date": d["transaction_date"].isoformat(), "amount": as_money(d["amount"])}
                for d in daily_rows
            ],
        }
    )


# --------------------------------------------------------------------------
# API - categories, health, export
# --------------------------------------------------------------------------

@app.route("/api/categories")
@login_required
def api_categories():
    return jsonify(
        {
            "income": INCOME_CATEGORIES,
            "expense": EXPENSE_CATEGORIES,
            "payment_methods": PAYMENT_METHODS,
        }
    )


@app.route("/api/health")
def api_health():
    reachable, error = db_status()
    return jsonify(
        {
            "status": "ok" if reachable else "unavailable",
            "database": Config.DB_NAME,
            "host": Config.DB_HOST,
            "error": error,
        }
    )


@app.route("/api/export/transactions.csv")
@login_required
def api_export_transactions():
    where, params, order = build_transaction_filters(request.args)
    try:
        with db_cursor() as (_, cursor):
            cursor.execute(
                f"""
                SELECT type, description, amount, category, transaction_date,
                       payment_method, notes, created_at
                FROM transactions {where}
                ORDER BY {order}
                """,
                params,
            )
            rows = cursor.fetchall()
    except psycopg2.Error as err:
        return api_error(f"Database error: {err}", 500)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["type", "description", "amount", "category", "date", "payment_method", "notes", "created_at"]
    )
    for row in rows:
        writer.writerow(
            [
                row["type"],
                row["description"],
                row["amount"],
                row["category"],
                row["transaction_date"],
                row["payment_method"],
                row["notes"],
            ]
        )

    filename = f"transactions_{date.today().isoformat()}.csv"
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------
# Error handlers
# --------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint not found."}), 404
    return render_template("404.html"), 404


@app.errorhandler(500)
def server_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error."}), 500
    return render_template("500.html"), 500


@app.errorhandler(psycopg2.Error)
def handle_db_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Database error occurred."}), 500
    return render_template("500.html"), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=app_config.DEBUG)
