type SignupFields = {
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
};

export const SIGNUP_PASSWORD_HINT = "Use 8–128 characters.";

export function validateSignupFields(fields: SignupFields):
  | { ok: true; name: string }
  | { ok: false; field: keyof SignupFields; message: string } {
  const firstName = fields.firstName.trim();
  const lastName = fields.lastName.trim();
  if (!firstName) {
    return { ok: false, field: "firstName", message: "Enter your first name." };
  }
  if (!lastName) {
    return { ok: false, field: "lastName", message: "Enter your last name." };
  }
  if (fields.password.length < 8 || fields.password.length > 128) {
    return { ok: false, field: "password", message: SIGNUP_PASSWORD_HINT };
  }
  if (fields.password !== fields.confirmPassword) {
    return { ok: false, field: "confirmPassword", message: "Passwords don’t match." };
  }
  return { ok: true, name: `${firstName} ${lastName}` };
}
