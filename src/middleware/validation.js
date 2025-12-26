const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const passwordRequirementsMessage =
  "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.";

const passwordPattern = "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}";

const isValidEmail = (email) => emailRegex.test(email);

const getNameValidationError = (name) => {
  if (!name) return "Full name is required.";
  if (name.length < 2) return "Full name must be at least 2 characters.";
  return null;
};

const getPasswordValidationError = (password) => {
  if (!password) return "Password is required.";
  if (!passwordRegex.test(password)) return passwordRequirementsMessage;
  return null;
};

module.exports = {
  isValidEmail,
  getNameValidationError,
  getPasswordValidationError,
  passwordRequirementsMessage,
  passwordPattern
};