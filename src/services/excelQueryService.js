
const { spawn } = require("child_process");
const path = require("path");

const pythonScriptPath = path.join(__dirname, "ai_query_engine.py");

async function queryExcelData(queryText) {
  return new Promise((resolve, reject) => {
    // Pass query text to the smart AI engine
    const pythonProcess = spawn("python3", [pythonScriptPath, queryText]);

    let result = "";
    let error = "";

    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}: ${error}`);
        // If it's a credentials error, give a more helpful message
        if (error.includes("GOOGLE_PRIVATE_KEY")) {
            resolve("❌ ระบบยังไม่ได้ตั้งค่า Google Service Account สำหรับการดึงข้อมูลจริง กรุณาตรวจสอบ Environment Variables ครับ");
        } else {
            reject(new Error(`Failed to query AI data: ${error}`));
        }
      } else {
        resolve(result.trim());
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("Failed to start Python subprocess.", err);
      reject(err);
    });
  });
}

module.exports = { queryExcelData };
