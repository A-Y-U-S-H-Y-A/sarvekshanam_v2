import sys
import json
import pyodbc

def safe_exec(cursor, query):
    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        return [tuple(r) for r in rows]
    except Exception as e:
        return []

def run_enum(target, port, username, password, trusted_connection):
    findings = {}
    
    conn_str = f"DRIVER={{SQL Server}};SERVER={target},{port};DATABASE=master;"
    if trusted_connection and str(trusted_connection).lower() in ['true', '1', 'yes']:
        conn_str += "Trusted_Connection=yes;"
    else:
        if username:
            conn_str += f"UID={username};"
        if password:
            conn_str += f"PWD={password};"
    
    try:
        conn = pyodbc.connect(conn_str, timeout=10)
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
        
    cursor = conn.cursor()
    
    # PHASE 1 – AUTHENTICATION & PRIVILEGE
    findings['auth_and_privilege'] = {}
    rows = safe_exec(cursor, "SELECT SYSTEM_USER, SUSER_SNAME()")
    findings['auth_and_privilege']['current_identity'] = rows[0] if rows else None
    
    rows = safe_exec(cursor, "SELECT CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT)")
    findings['auth_and_privilege']['is_integrated_security_only'] = rows[0][0] if rows else None
    
    rows = safe_exec(cursor, "SELECT IS_SRVROLEMEMBER('sysadmin')")
    findings['auth_and_privilege']['is_sysadmin'] = rows[0][0] if rows else None
    
    # PHASE 2 – SERVER ENUMERATION
    findings['server_enumeration'] = {}
    rows = safe_exec(cursor, "SELECT name, type_desc, is_disabled FROM sys.server_principals WHERE type_desc IN ('SQL_LOGIN','WINDOWS_LOGIN')")
    findings['server_enumeration']['server_logins'] = rows
    
    rows = safe_exec(cursor, "SELECT r.name AS role, m.name AS member FROM sys.server_role_members rm JOIN sys.server_principals r ON rm.role_principal_id = r.principal_id JOIN sys.server_principals m ON rm.member_principal_id = m.principal_id")
    findings['server_enumeration']['server_role_memberships'] = rows
    
    rows = safe_exec(cursor, "SELECT g.name AS grantee, p.name AS grantor FROM sys.server_permissions sp JOIN sys.server_principals g ON sp.grantee_principal_id = g.principal_id JOIN sys.server_principals p ON sp.grantor_principal_id = p.principal_id WHERE sp.permission_name = 'IMPERSONATE'")
    findings['server_enumeration']['impersonation_grants'] = rows
    
    # PHASE 3 – DATABASE ACCESS
    rows = safe_exec(cursor, "SELECT name, HAS_DBACCESS(name) FROM sys.databases")
    db_access = [{"database": r[0], "access": r[1] == 1} for r in rows]
    findings['database_access'] = db_access
    
    accessible_dbs = [r[0] for r in rows if r[1] == 1]
    
    # PHASE 4 – PER DATABASE ENUMERATION
    findings['databases'] = {}
    for db in accessible_dbs:
        db_info = {}
        try:
            cursor.execute(f"USE [{db}]")
        except Exception as e:
            db_info['error'] = str(e)
            findings['databases'][db] = db_info
            continue
            
        rows = safe_exec(cursor, "SELECT name FROM sys.database_principals WHERE type_desc='DATABASE_ROLE'")
        db_info['database_roles'] = [r[0] for r in rows]
        
        rows = safe_exec(cursor, "SELECT * FROM fn_my_permissions(NULL,'DATABASE')")
        db_info['my_permissions'] = rows
        
        rows = safe_exec(cursor, f"SELECT is_trustworthy_on FROM sys.databases WHERE name='{db}'")
        db_info['is_trustworthy_on'] = rows[0][0] if rows else None
        
        tables = safe_exec(cursor, "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
        db_info['tables'] = []
        for schema, table in tables:
            table_info = {"schema": schema, "name": table}
            cols = safe_exec(cursor, f"SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='{schema}' AND TABLE_NAME='{table}' ORDER BY ORDINAL_POSITION")
            table_info['columns'] = [{"name": c[0], "type": c[1], "nullable": c[2]} for c in cols]
            
            try:
                cursor.execute(f"SELECT TOP 5 * FROM [{schema}].[{table}]")
                t_rows = cursor.fetchall()
                table_info['sample_rows'] = [[str(item) for item in row] for row in t_rows]
            except Exception as e:
                table_info['sample_rows_error'] = str(e)
                
            db_info['tables'].append(table_info)
            
        findings['databases'][db] = db_info

    # PHASE 5 – DANGEROUS FEATURES
    findings['dangerous_features'] = {}
    rows = safe_exec(cursor, "EXEC sp_configure 'xp_cmdshell'")
    findings['dangerous_features']['xp_cmdshell'] = rows
    
    rows = safe_exec(cursor, "SELECT value_in_use FROM sys.configurations WHERE name='clr enabled'")
    findings['dangerous_features']['clr_enabled'] = rows[0][0] if rows else None
    
    rows = safe_exec(cursor, "SELECT name, is_linked FROM sys.servers")
    findings['dangerous_features']['linked_servers'] = rows

    conn.close()
    
    return {
        "status": "success",
        "findings": findings
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Missing target"}))
        sys.exit(1)
        
    target = sys.argv[1]
    port = "1433"
    username = None
    password = None
    trusted_connection = "false"
    
    if len(sys.argv) > 2 and sys.argv[2].strip():
        port = sys.argv[2].strip()
    if len(sys.argv) > 3 and sys.argv[3].strip():
        username = sys.argv[3].strip()
    if len(sys.argv) > 4 and sys.argv[4].strip():
        password = sys.argv[4].strip()
    if len(sys.argv) > 5 and sys.argv[5].strip():
        trusted_connection = sys.argv[5].strip()

    results = run_enum(target, port, username, password, trusted_connection)
    print(json.dumps(results, indent=2, default=str))
