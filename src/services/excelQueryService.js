
const { spawn } = require("child_process");
const path = require("path");

const pythonScriptPath = path.join(__dirname, "excel_query_engine.py");
// Corrected path to project files
const projectFilePath = "/home/ubuntu/.manus/config/project-file";

async function queryExcelData(queryText) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", [pythonScriptPath, queryText, projectFilePath]);

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
        reject(new Error(`Failed to query Excel data: ${error}`));
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
