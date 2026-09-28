// Backend manzili (Vercel'dagi backend loyihasi). Deploydan keyin shu yerga yozing:
// Backend URL (your backend project on Vercel). Fill this in after deploying:
var BACKEND_URL = "https://vazifa-api.vercel.app";

(function () {
  var local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local) {
    // Kompyuterda: backend doim http://localhost:8000 da ishlaydi.
    // Sahifa ham shu serverdan ochilgan bo'lsa, manzil kerak emas.
    window.VAZIFA_API_URL = location.port === "8000" ? "" : "http://localhost:8000";
  } else {
    window.VAZIFA_API_URL = BACKEND_URL || null; // null = hali sozlanmagan
  }
})();
