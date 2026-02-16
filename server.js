const STRINGS = require("./lang/en/en.js");
require("dotenv").config();

const http = require("http");
const mysql = require("mysql2");
const url = require("url");

class Database {
    constructor(config) {
        this.connection = mysql.createConnection(config);
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.connection.connect(err => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }

    query(sql) {
        return new Promise((resolve, reject) => {
            this.connection.query(sql, (err, results) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(results);
                }
            });
        });
    }
}

class PatientService {
    constructor(db) {
        this.db = db;
    }

    async createTableIfNeeded() {
        const sql = `
            CREATE TABLE IF NOT EXISTS patient (
                patientid INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                dateOfBirth DATE
            ) ENGINE=InnoDB;
        `;
        await this.db.query(sql);
    }

    async insertPatients() {
        const sql = `
            INSERT INTO patient (name, dateOfBirth)
            VALUES ('Sara Brown', '1901-01-01'),
                   ('John Smith', '1941-01-01'),
                   ('Jack Ma', '1961-01-30'),
                   ('Elon Musk', '1999-01-01');
        `;
        return await this.db.query(sql);
    }
}

class APIServer {
    constructor(config) {
        this.host = config.host;
        this.port = config.port;
        this.apiBase = config.apiBase;
        this.patientService = config.patientService;
        this.readDB = config.readDB;

        this.server = http.createServer(this.requestHandler.bind(this));
    }

    start() {
        this.server.listen(this.port, this.host, () => {
            console.log(`Server running at http://${this.host}:${this.port}`);
        });
    }

    setHeaders(res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    async handleInsert(res) {
        try {
            await this.patientService.createTableIfNeeded();
            const result = await this.patientService.insertPatients();

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(STRINGS.insertSuccess.replace("%1", result.affectedRows));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(STRINGS.insertError + err.message);
        }
    }

    handleSQL(pathname, res) {
        const encodedQuery = pathname.replace(this.apiBase + "/sql/", "");
        const sqlQuery = decodeURIComponent(encodedQuery);

        try {
            this.readDB.connection.query(sqlQuery, (err, results) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end(STRINGS.queryError + err.message);
                    return;
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(results, null, 2));
            });
        } catch (err) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end(err.message);
        }
    }

    async requestHandler(req, res) {
        this.setHeaders(res);

        if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        if (req.method === "POST" && pathname === this.apiBase + "/insert") {
            await this.handleInsert(res);
            return;
        }

        if (req.method === "GET" && pathname.startsWith(this.apiBase + "/sql/")) {
            this.handleSQL(pathname, res);
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(STRINGS.routeNotFound);
    }
}

const insertDB = new Database({
    host: process.env.DB_HOST,
    user: process.env.DB_INSERT_USER,
    password: process.env.DB_INSERT_PASSWORD,
    database: process.env.DB_NAME
});

const readDB = new Database({
    host: process.env.DB_HOST,
    user: process.env.DB_READ_USER,
    password: process.env.DB_READ_PASSWORD,
    database: process.env.DB_NAME
});

Promise.all([
    insertDB.connect(),
    readDB.connect()
])
    .then(() => {
        const patientService = new PatientService(insertDB);
        const server = new APIServer({
            host: process.env.HOST || "localhost",
            port: process.env.PORT || 3000,
            apiBase: process.env.API_BASE || "/lab4/api/v1",
            patientService,
            readDB
        });

        server.start();

    })
    .catch(err => {
        console.error("DB connection error:", err);
    });
