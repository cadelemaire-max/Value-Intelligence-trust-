import { execSync } from "child_process";

try {
  console.log("Installing pip...");
  execSync("curl -sS https://bootstrap.pypa.io/get-pip.py | python3", { stdio: "inherit" });
  console.log("Installing python packages...");
  execSync("python3 -m pip install requests pandas scikit-learn joblib --break-system-packages", { stdio: "inherit" });
  console.log("Done.");
} catch (e) {
  console.error("Failed to install:", e);
}
