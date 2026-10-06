const form = document.getElementById("profileForm");
const jobRole = document.getElementById("jobRole");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");

async function loadJobs() {
  try {
    const response = await fetch("/api/jobs");
    const jobs = await response.json();

    jobRole.innerHTML = '<option value="">Select a job role</option>';
    jobs.forEach(job => {
      const option = document.createElement("option");
      option.value = job.job_role;
      option.textContent = `${job.job_role} — ${job.category}`;
      jobRole.appendChild(option);
    });
  } catch (error) {
    jobRole.innerHTML = '<option value="">Unable to load roles</option>';
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  loading.classList.remove("hidden");
  errorBox.classList.add("hidden");

  const formData = new FormData(form);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to analyze profile.");
    }

    sessionStorage.setItem("skillbridgeResult", JSON.stringify(result));
    window.location.href = "/result.html";
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
  }
});

loadJobs();
