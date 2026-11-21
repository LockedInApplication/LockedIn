import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Signup from "./Signup";
import * as signupFields from "./signup-fields";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
vi.mock("@/utils/authCLient", () => ({ authClient: {} }));

it("keeps signup credentials out of the URL on a native form submission", () => {
  const html = renderToStaticMarkup(<Signup onError={() => {}} />);

  expect(html).toMatch(/<form\b[^>]*\bmethod="post"/i);
});

it("renders separate autofill-ready name fields", () => {
  const html = renderToStaticMarkup(<Signup onError={() => {}} />);

  expect(html).toMatch(/<input(?=[^>]*name="firstName")(?=[^>]*autoComplete="given-name")(?=[^>]*required)[^>]*>/i);
  expect(html).toMatch(/<input(?=[^>]*name="lastName")(?=[^>]*autoComplete="family-name")(?=[^>]*required)[^>]*>/i);
});

it("labels the confirmation as a new password field for autofill", () => {
  const html = renderToStaticMarkup(<Signup onError={() => {}} />);

  expect(html).toContain('<label for="confirmPassword">Confirm password</label>');
  expect(html).toMatch(/<input(?=[^>]*name="confirmPassword")(?=[^>]*type="password")(?=[^>]*autoComplete="new-password")(?=[^>]*required)[^>]*>/i);
});

const validFields = {
  firstName: "  Ava  ",
  lastName: "  De León  ",
  password: "Hello world! ",
  confirmPassword: "Hello world! ",
};

it("joins the trimmed names in the format expected by the auth API", () => {
  expect(signupFields.validateSignupFields(validFields)).toEqual({
    ok: true,
    name: "Ava De León",
  });
});

it.each([
  ["firstName", "   ", "firstName"],
  ["lastName", "   ", "lastName"],
  ["confirmPassword", "Hello world!", "confirmPassword"],
  ["confirmPassword", "", "confirmPassword"],
] as const)("rejects invalid %s value %j", (field, value, invalidField) => {
  expect(signupFields.validateSignupFields({ ...validFields, [field]: value })).toMatchObject({
    ok: false,
    field: invalidField,
  });
});

it.each([[7, false], [8, true], [128, true], [129, false]] as const)(
  "validates a password of %i characters against the server length limits",
  (length, ok) => {
    const password = "x".repeat(length);
    expect(signupFields.validateSignupFields({ ...validFields, password, confirmPassword: password })).toMatchObject(
      ok ? { ok: true } : { ok: false, field: "password" },
    );
  },
);
