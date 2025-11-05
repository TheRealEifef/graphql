// login.js

const SIGNIN_URL = "https://learn.reboot01.com/api/auth/signin";

document.getElementById("loginForm")
  .addEventListener("submit", handleLogin);

async function handleLogin(e) {
  e.preventDefault();

  const user = document.getElementById("userOrEmail").value.trim();
  const pwd = document.getElementById("password").value;

  if (!user || !pwd) return showError("Both fields are required");

  const encoded = btoa(`${user}:${pwd}`);

  try {
    const res = await fetch(SIGNIN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${encoded}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      let errBody;
      try { errBody = await res.json(); }
      catch (_) { errBody = { error: await res.text() }; }
      return showError(errBody.error || "Invalid credentials");
    }

    // 1) Get raw body
    const raw = await res.text();
    console.log("Raw signin response:", raw);

    // 2) Parse JWT out of that raw body
    let jwt;
    try {
      const parsed = JSON.parse(raw);
      jwt = typeof parsed === "string"
        ? parsed
        : parsed.token || parsed.jwt || parsed.accessToken;
    } catch {
      jwt = raw.replace(/^"(.*)"$/, "$1");
    }

    // 3) Validate format
    if (!jwt || jwt.split(".").length !== 3) {
      throw new Error(`Invalid JWT received: "${jwt}"`);
    }

    console.log("Using JWT:", jwt);
    localStorage.setItem("jwt", jwt);
    window.location.href = "profile.html";

  } catch (err) {
    console.error("Login error:", err);
    showError(err.message.startsWith("Invalid JWT")
      ? "Unexpected server response"
      : `Network error: ${err.message}`);
  }
}

function showError(msg) {
  document.getElementById("errorMsg").textContent = msg;
}
