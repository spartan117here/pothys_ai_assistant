import json
import logging
from typing import Optional, Any
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize OpenAI client
# Fallback to a dummy key if not present (to prevent immediate crash if not configured)
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY or "dummy")

SCHEMA_CONTEXT = """
You are a PostgreSQL expert and a Business Data Analyst AI for an executive application.
You must generate a VALID read-only PostgreSQL query based on the following database schema.

TABLE branches (
  id UUID PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  code VARCHAR(20) UNIQUE,
  monthly_sales_target NUMERIC(15, 2),
  created_at TIMESTAMP WITH TIME ZONE
);

TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  full_name VARCHAR(150),
  role VARCHAR(50), -- e.g., 'AGM', 'MANAGER'
  branch_id UUID REFERENCES branches(id)
);

TABLE daily_reports (
  id UUID PRIMARY KEY,
  branch_id UUID REFERENCES branches(id),
  manager_id UUID REFERENCES users(id),
  date DATE,
  sales_amount NUMERIC(15, 2),
  attendance_count INTEGER,
  target_achievement NUMERIC(5, 2),
  remarks VARCHAR(1000),
  issues VARCHAR(1000),
  status VARCHAR(20), -- 'DRAFT' or 'SUBMITTED'
  gold_sales NUMERIC(15, 2),
  silver_sales NUMERIC(15, 2),
  platinum_sales NUMERIC(15, 2),
  diamond_sales NUMERIC(15, 2),
  total_revenue NUMERIC(15, 2),
  digigold_enrollments INTEGER,
  digisilver_enrollments INTEGER,
  employees_present INTEGER,
  employees_absent INTEGER,
  customer_complaints VARCHAR(1000),
  operational_issues VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE
);

TABLE employees (
  id UUID PRIMARY KEY,
  branch_id UUID REFERENCES branches(id),
  name VARCHAR(100),
  designation VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE
);

TABLE employee_performances (
  id UUID PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id),
  employee_id UUID REFERENCES employees(id),
  gold_grams_sold NUMERIC(10, 3),
  gold_amount NUMERIC(15, 2),
  silver_grams_sold NUMERIC(10, 3),
  silver_amount NUMERIC(15, 2),
  platinum_amount NUMERIC(15, 2),
  diamond_amount NUMERIC(15, 2),
  digigold_enrollments INTEGER,
  digisilver_enrollments INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
);

IMPORTANT RULES:
1. ONLY return the raw SQL query. Do not wrap it in markdown block like ```sql. Do not add any explanations.
2. Only use SELECT queries. NEVER output INSERT, UPDATE, DELETE, DROP, or ALTER.
3. If the user asks for 'today', assume the current date by using CURRENT_DATE.
4. When matching string names, use ILIKE for case insensitivity and partial matches (e.g. branches.name ILIKE '%coimbatore%').
5. Note that branch names often contain 'Swarna Mahal'. Use ILIKE to ignore it.
6. The total revenue for a branch is in `daily_reports.total_revenue` or `daily_reports.sales_amount`.
7. Manager remarks are in `daily_reports.remarks`.
8. Operational issues are in `daily_reports.operational_issues` or `daily_reports.issues`.
9. Customer complaints are in `daily_reports.customer_complaints`.
10. If the user asks for a branch report, summary, or performance (e.g., 'Coimbatore report'), ALWAYS SELECT total_revenue, gold_sales, silver_sales, platinum_sales, diamond_sales, digigold_enrollments, digisilver_enrollments, attendance_count, customer_complaints, operational_issues, and remarks.
11. For report-related questions, NEVER query the Branch Master table alone (e.g., SELECT * FROM branches). You must ALWAYS query the `daily_reports` table (joining with `branches` to filter by name).
12. If the user asks for the best performer (e.g. 'Who is the best performer in Coimbatore?'), you MUST query the `employee_performances` table (joined with `employees`, `daily_reports`, and `branches`), ordered by the sum of sales amounts (gold_amount + silver_amount + platinum_amount + diamond_amount) descending, limited to 1. Do NOT return the branch daily report summary.
"""

class AIQueryService:
    @staticmethod
    def _generate_sql_fallback(
        query: str,
        dialect: str = "postgresql",
        user_branch_id: Optional[str] = None,
    ) -> str:
        q = query.lower()
        like_op = "LIKE" if dialect == "sqlite" else "ILIKE"
        date_func = "date('now')" if dialect == "sqlite" else "CURRENT_DATE"

        # Identify target branch
        branches_map = {
            "coimbatore": "Coimbatore",
            "trichy": "Trichy",
            "madurai": "Madurai",
            "chromepet": "Chromepet",
            "t. nagar": "T. Nagar",
            "tnagar": "T. Nagar",
            "tirunelveli": "Tirunelveli",
            "nagercoil": "Nagercoil",
            "pondicherry": "Pondicherry"
        }
        
        branch_key = None
        for b in branches_map:
            if b in q:
                branch_key = b
                break

        # Check if it is an employee performance related query
        is_performer_query = any(w in q for w in ["performer", "performance", "best", "employee", "salesperson", "staff", "who is the best"])

        if branch_key:
            if is_performer_query:
                # Query employee performances for the branch
                sql = (
                    f"SELECT e.name AS employee_name, ep.gold_amount, ep.silver_amount, ep.platinum_amount, ep.diamond_amount, "
                    f"(ep.gold_amount + ep.silver_amount + ep.platinum_amount + ep.diamond_amount) AS total_sales "
                    f"FROM employee_performances ep "
                    f"JOIN employees e ON ep.employee_id = e.id "
                    f"JOIN daily_reports dr ON ep.report_id = dr.id "
                    f"JOIN branches b ON dr.branch_id = b.id "
                    f"WHERE b.name {like_op} '%{branches_map[branch_key]}%' AND dr.date = {date_func}"
                )
                if user_branch_id:
                    sql += f" AND dr.branch_id = '{user_branch_id}'"
                sql += " ORDER BY total_sales DESC LIMIT 1"
                return sql
            else:
                # Query daily report details for the branch
                sql = (
                    f"SELECT dr.total_revenue, dr.gold_sales, dr.silver_sales, dr.platinum_sales, "
                    f"dr.diamond_sales, dr.digigold_enrollments, dr.digisilver_enrollments, "
                    f"dr.attendance_count, dr.customer_complaints, dr.operational_issues, dr.remarks, dr.date "
                    f"FROM daily_reports dr "
                    f"JOIN branches b ON dr.branch_id = b.id "
                    f"WHERE b.name {like_op} '%{branches_map[branch_key]}%' AND dr.date = {date_func}"
                )
                if user_branch_id:
                    sql += f" AND dr.branch_id = '{user_branch_id}'"
                sql += " ORDER BY dr.date DESC LIMIT 1"
                return sql

        # If no specific branch is mentioned, fallback to global queries
        if "submitted" in q and "today" in q:
            sql = (
                f"SELECT b.name as branch_name, dr.date, dr.status, dr.total_revenue "
                f"FROM daily_reports dr JOIN branches b ON dr.branch_id = b.id "
                f"WHERE dr.date = {date_func} AND dr.status = 'SUBMITTED'"
            )
            if user_branch_id:
                sql += f" AND dr.branch_id = '{user_branch_id}'"
            return sql
            
        elif "pending" in q:
            sql = (
                f"SELECT b.name FROM branches b WHERE b.id NOT IN ("
                f"SELECT dr.branch_id FROM daily_reports dr "
                f"WHERE dr.date = {date_func} AND dr.status = 'SUBMITTED'"
                f")"
            )
            if user_branch_id:
                sql = (
                    f"SELECT b.name FROM branches b WHERE b.id = '{user_branch_id}' AND b.id NOT IN ("
                    f"SELECT dr.branch_id FROM daily_reports dr "
                    f"WHERE dr.date = {date_func} AND dr.status = 'SUBMITTED'"
                    f")"
                )
            return sql

        # Default fallback
        sql = "SELECT * FROM branches"
        if user_branch_id:
            sql += f" WHERE id = '{user_branch_id}'"
        return sql

    @staticmethod
    def _format_response_fallback(query: str, data: list[dict]) -> str:
        q = query.lower()

        # Identify target branch
        branches_map = {
            "coimbatore": "Coimbatore",
            "trichy": "Trichy",
            "madurai": "Madurai",
            "chromepet": "Chromepet",
            "t. nagar": "T. Nagar",
            "tnagar": "T. Nagar",
            "tirunelveli": "Tirunelveli",
            "nagercoil": "Nagercoil",
            "pondicherry": "Pondicherry"
        }
        
        branch_key = None
        for b in branches_map:
            if b in q:
                branch_key = b
                break

        is_performer_query = any(w in q for w in ["performer", "performance", "best", "employee", "salesperson", "staff", "who is the best"])

        if branch_key:
            display_name = branches_map[branch_key]
            if not data:
                return f"No report has been submitted today for {display_name}."

            if is_performer_query:
                # Format best performer response
                row = data[0]
                emp_name = row.get("employee_name") or row.get("name")
                total_sales = row.get("total_sales")
                gold = row.get("gold_amount") or 0
                silver = row.get("silver_amount") or 0
                platinum = row.get("platinum_amount") or 0
                diamond = row.get("diamond_amount") or 0

                if total_sales is None:
                    total_sales = float(gold) + float(silver) + float(platinum) + float(diamond)

                def fmt_curr(val):
                    if val is None:
                        return "₹0"
                    try:
                        v = float(val)
                        if v < 100000:
                            return f"₹{v:,.0f}"
                        elif v < 10000000:
                            return f"₹{v/100000:.2f}L"
                        else:
                            return f"₹{v/10000000:.2f}Cr"
                    except:
                        return f"₹{val}"

                return (
                    f"The best performing employee in **{display_name} Swarna Mahal** today is **{emp_name}** "
                    f"with a total sales volume of **{fmt_curr(total_sales)}**.\n\n"
                    f"**Sales Breakdown**:\n"
                    f"- **Gold Sales**: {fmt_curr(gold)}\n"
                    f"- **Silver Sales**: {fmt_curr(silver)}\n"
                    f"- **Platinum Sales**: {fmt_curr(platinum)}\n"
                    f"- **Diamond Sales**: {fmt_curr(diamond)}"
                )
            else:
                # Format daily report response
                row = data[0]
                def fmt_curr(val):
                    if val is None:
                        return "₹0"
                    try:
                        v = float(val)
                        if v < 100000:
                            return f"₹{v:,.0f}"
                        elif v < 10000000:
                            return f"₹{v/100000:.2f}L"
                        else:
                            return f"₹{v/10000000:.2f}Cr"
                    except:
                        return f"₹{val}"
                        
                rev = fmt_curr(row.get("total_revenue"))
                gold = fmt_curr(row.get("gold_sales"))
                silver = fmt_curr(row.get("silver_sales"))
                platinum = fmt_curr(row.get("platinum_sales"))
                diamond = fmt_curr(row.get("diamond_sales"))
                
                digigold = row.get("digigold_enrollments", 0)
                digisilver = row.get("digisilver_enrollments", 0)
                attendance = row.get("attendance_count", 0)
                complaints = row.get("customer_complaints") or "None"
                op_issues = row.get("operational_issues") or "None"
                remarks = row.get("remarks") or "None"
                date = row.get("date") or "today"
                
                return (
                    f"Here is the daily executive summary report for **{display_name} Swarna Mahal** on **{date}**:\n\n"
                    f"- **Revenue**: {rev}\n"
                    f"- **Gold**: {gold}\n"
                    f"- **Silver**: {silver}\n"
                    f"- **Platinum**: {platinum}\n"
                    f"- **Diamond**: {diamond}\n"
                    f"- **DigiGold**: {digigold} enrollments\n"
                    f"- **DigiSilver**: {digisilver} enrollments\n"
                    f"- **Attendance**: {attendance} employees present\n"
                    f"- **Complaints**: {complaints}\n"
                    f"- **Operational Issues**: {op_issues}\n"
                    f"- **Manager Remarks**: {remarks}"
                )

        if "submitted" in q and "today" in q:
            if not data:
                return "No daily reports have been submitted today. All branches are currently in DRAFT status."
            
            lines = ["Yes, the following daily reports have been submitted today:"]
            for row in data:
                branch = row.get("branch_name", "Unknown Branch")
                rev = row.get("total_revenue", 0)
                lines.append(f"- **{branch}**: Submitted (Revenue: ₹{rev:,.2f})")
            return "\n".join(lines)
            
        elif "pending" in q:
            if not data:
                return "All branches have submitted their reports today. No branch reports are pending."
                
            lines = ["The following branches are pending submission of today's report:"]
            for row in data:
                name = row.get("name")
                if name:
                    lines.append(f"- {name}")
            return "\n".join(lines)
            
        if not data:
            return "No data found for the requested criteria."
        return f"Retrieved {len(data)} records:\n\n" + "\n".join([str(row) for row in data])

    @staticmethod
    async def generate_sql(
        query: str, 
        dialect: str = "postgresql", 
        user_branch_id: Optional[str] = None, 
        user_branch_name: Optional[str] = None
    ) -> str:
        """Use LLM to generate SQL from user query, falling back to rule-based generation if LLM is unavailable."""
        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.startswith("mock-key"):
            logger.info("Using deterministic SQL generation fallback (mock key detected)")
            return AIQueryService._generate_sql_fallback(query, dialect, user_branch_id)
            
        try:
            system_prompt = SCHEMA_CONTEXT
            system_prompt += f"\n\nDATABASE DIALECT: Generate a valid {dialect} query."
            
            if dialect == "sqlite":
                system_prompt += (
                    "\nSQLite Specific Rules:\n"
                    "- Do NOT use 'ILIKE' or 'postgres' syntax. SQLite is case-insensitive for standard ASCII characters when using LIKE, so use 'LIKE' instead of 'ILIKE'.\n"
                    "- Do NOT use PostgreSQL date syntax like CURRENT_DATE - INTERVAL '1 day'. Instead:\n"
                    "  - For today: use date('now')\n"
                    "  - For yesterday: use date('now', '-1 day')\n"
                    "  - For dates subtraction or additions, use SQLite date/datetime function modifiers (e.g. date('now', '-7 days')).\n"
                    "- To match dates exactly, compare date column directly with strings formatted as 'YYYY-MM-DD'."
                )
            else:
                system_prompt += (
                    "\nPostgreSQL Specific Rules:\n"
                    "- Use 'ILIKE' for case-insensitive string pattern matching.\n"
                    "- Use CURRENT_DATE for today, CURRENT_DATE - INTERVAL '1 day' for yesterday, and similar interval math for weekly/monthly trends.\n"
                    "- Use Postgres-specific syntax where appropriate."
                )
                
            if user_branch_id and user_branch_name:
                system_prompt += (
                    f"\n\nSECURITY CONSTRAINT:\n"
                    f"The user is a MANAGER for the branch '{user_branch_name}' (ID: '{user_branch_id}').\n"
                    f"You MUST restrict all data access to this branch only. Any query referencing daily_reports, "
                    f"employee_performances, or branches MUST include a filter matching branch_id = '{user_branch_id}' "
                    f"to prevent exposing other branches' data."
                )
            
            response = await openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Generate a SQL query for: {query}"}
                ],
                temperature=0.0,
                max_tokens=300
            )
            
            sql = response.choices[0].message.content.strip()
            
            # Clean up markdown if the LLM hallucinated it despite instructions
            if sql.startswith("```sql"):
                sql = sql.replace("```sql", "")
            if sql.startswith("```"):
                sql = sql.replace("```", "")
            if sql.endswith("```"):
                sql = sql[:-3]
                
            return sql.strip()
        except Exception as e:
            logger.warning(f"Error generating SQL via OpenAI: {e}. Falling back to rule-based generation.")
            return AIQueryService._generate_sql_fallback(query, dialect, user_branch_id)

    @staticmethod
    async def execute_query(db: AsyncSession, sql: str, user_branch_id: Optional[str] = None) -> list[dict]:
        """Safely execute the read-only SQL query."""
        sql_upper = sql.upper()
        
        # Enforce READ-ONLY
        forbidden_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "COMMIT"]
        for keyword in forbidden_keywords:
            if f"{keyword} " in sql_upper or f" {keyword}" in sql_upper or sql_upper.startswith(f"{keyword}"):
                raise Exception(f"Forbidden SQL operation detected: {keyword}")
                
        try:
            result = await db.execute(text(sql))
            
            # Fetch all rows and convert to dict
            rows = result.mappings().all()
            
            # Post-execute safety filter check for managers
            if user_branch_id:
                filtered_rows = []
                for row in rows:
                    row_dict = dict(row)
                    # If the row has branch_id, make sure it matches
                    if "branch_id" in row_dict:
                        if str(row_dict["branch_id"]).lower() != str(user_branch_id).lower():
                            continue
                    filtered_rows.append(row_dict)
                return filtered_rows
                
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"SQL execution error: {e}\nQuery: {sql}")
            raise Exception("Database execution failed.")

    @staticmethod
    async def format_response(query: str, data: list[dict]) -> str:
        """Use LLM to format the SQL data into a natural language executive summary, falling back to rule-based formatting if LLM is unavailable."""
        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.startswith("mock-key"):
            logger.info("Using deterministic response formatting fallback (mock key detected)")
            return AIQueryService._format_response_fallback(query, data)
            
        try:
            system_prompt = (
                "You are an executive business analyst. You will be provided with a user's question and the raw JSON "
                "results returned from the database.\n"
                "Your task is to summarize the data clearly and professionally.\n"
                "RULES:\n"
                "- Do not mention SQL, database, rows, or JSON.\n"
                "- If the data is empty, say 'I cannot find this information in the reports.' or 'No data found for the requested criteria.'\n"
                "- Use professional Indian business formatting for ALL monetary values:\n"
                "  * Less than ₹1,00,000: e.g. ₹95,000\n"
                "  * ₹1 Lakh to ₹99.99 Lakhs: e.g. ₹25.40L (where 1 Lakh = 100,000)\n"
                "  * ₹1 Crore and above: e.g. ₹1.25Cr (where 1 Crore = 10,000,000)\n"
                "- Use bullet points for readability when listing multiple items or attributes.\n"
                "- When presenting a branch report or summary, you MUST explicitly list: Revenue, Gold, Silver, Platinum, Diamond, DigiGold, DigiSilver, Attendance, Complaints, Operational Issues, and Manager Remarks.\n"
                "- Keep the tone professional, concise, and executive."
            )
            
            data_str = json.dumps(data, indent=2, default=str)
            
            user_prompt = f"User Question: {query}\n\nDatabase Result:\n{data_str}"
            
            response = await openai_client.chat.completions.create(
                model="gpt-4o", # Higher tier model for better reasoning and formatting
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=500
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.warning(f"Error formatting response via OpenAI: {e}. Falling back to rule-based formatting.")
            return AIQueryService._format_response_fallback(query, data)

    @staticmethod
    async def process_query(query: str, db: AsyncSession, current_user: Optional[Any] = None) -> str:
        """Main entry point: Query -> SQL -> Execute -> Format -> Response"""
        try:
            # 1. Detect DB dialect dynamically
            bind_engine = db.bind
            dialect = "postgresql"
            if bind_engine and "sqlite" in str(bind_engine.url):
                dialect = "sqlite"
                
            # 2. Extract manager branch constraints
            user_branch_id = None
            user_branch_name = None
            if current_user and current_user.role == "MANAGER":
                user_branch_id = str(current_user.branch_id)
                # Fetch branch name to help LLM filter in SQL if needed
                from app.models.branch import Branch
                stmt = select(Branch).where(Branch.id == current_user.branch_id)
                res = await db.execute(stmt)
                branch = res.scalars().first()
                if branch:
                    user_branch_name = branch.name
            
            # 3. Generate SQL
            sql = await AIQueryService.generate_sql(
                query=query, 
                dialect=dialect, 
                user_branch_id=user_branch_id, 
                user_branch_name=user_branch_name
            )
            logger.info(f"Generated SQL ({dialect}): {sql}")
            
            # 4. Execute SQL
            data = await AIQueryService.execute_query(db, sql, user_branch_id=user_branch_id)
            logger.info(f"SQL returned {len(data)} rows.")
            
            # 5. Format Response
            response = await AIQueryService.format_response(query, data)
            return response
            
        except Exception as e:
            logger.error(f"Query Pipeline Error: {e}")
            return f"I encountered an issue processing your request: {str(e)}"

ai_query_service = AIQueryService()
