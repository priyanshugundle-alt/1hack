function saveProfile() {

  const height = document.getElementById("height").value / 100;
  const weight = document.getElementById("weight").value;

  const bmi = (weight / (height * height)).toFixed(2);

  document.getElementById("bmiResult").innerText =
    "Your BMI: " + bmi;

  localStorage.setItem("userProfile", JSON.stringify({
    name: document.getElementById("name").value,
    bmi: bmi
  }));

  alert("Profile Saved");
}
