const mysql = require("mysql2");

const con = mysql.createConnection({
    host: "localhost", // หรือชื่อโฮสต์ของคุณ
    user: "root",      // ชื่อผู้ใช้ MySQL
    password: "",      // รหัสผ่าน MySQL
    database: "seniorr" // ชื่อฐานข้อมูล
});

con.connect((err) => {
    if (err) {
        console.error("Error connecting to the database:", err);
        throw err;
    }
    console.log("Database connected!");
});

module.exports = con; // ส่งออกตัวแปร con
