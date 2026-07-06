const { spawn } = require("child_process");
const path = require("path");

const pythonScriptPath = path.join(__dirname, "ai_query_engine.py");

/**
 * ฟังก์ชันสำหรับเรียกใช้งาน AI Query Engine (Python)
 * รองรับการทำงานทั้งบน Local, Railway และ Azure
 */
async function queryExcelData(queryText) {
  return new Promise((resolve, reject) => {
    // บน Azure หรือ Server บางที่ อาจจะใช้คำสั่ง 'python' แทน 'python3'
    // เราจะลองใช้ python3 ก่อน ถ้าไม่ได้ค่อยลอง python
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    
    console.log(`[AI QUERY] Running ${pythonCmd} with script: ${pythonScriptPath}`);
    
    const pythonProcess = spawn(pythonCmd, [pythonScriptPath, queryText]);

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
        
        // วิเคราะห์ Error เพื่อตอบกลับผู้ใช้ให้เข้าใจง่ายขึ้น
        if (error.includes("GOOGLE_PRIVATE_KEY") || error.includes("credentials")) {
            resolve("❌ ระบบยังไม่ได้ตั้งค่าสิทธิ์เข้าถึง Google Sheets (Service Account) กรุณาตรวจสอบ Environment Variables ครับ");
        } else if (error.includes("OPENAI_API_KEY")) {
            resolve("❌ ระบบยังไม่ได้ตั้งค่า AI Key (OpenAI) สำหรับการวิเคราะห์ข้อมูลครับ");
        } else if (error.includes("ModuleNotFoundError")) {
            resolve("❌ ระบบขาด Library สำหรับประมวลผล (Pandas/Google API) กรุณาแจ้งผู้พัฒนาให้ติดตั้ง dependencies ครับ");
        } else {
            resolve(`❌ เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูล (Code: ${code})`);
        }
      } else {
        // ส่งผลลัพธ์ที่ AI วิเคราะห์ได้กลับไป
        resolve(result.trim());
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("Failed to start Python subprocess.", err);
      // กรณีหาคำสั่ง python3 ไม่เจอ
      if (err.code === 'ENOENT') {
        resolve("❌ ไม่พบตัวรัน Python บน Server กรุณาตรวจสอบการติดตั้ง Python ครับ");
      } else {
        reject(err);
      }
    });
  });
}

module.exports = { queryExcelData };
