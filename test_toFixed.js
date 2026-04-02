console.log("NaN.toFixed(1):", (NaN).toFixed(1));
try {
  console.log("undefined.toFixed(1):", (undefined).toFixed(1));
} catch (e) {
  console.log("undefined.toFixed(1) error:", e.message);
}
