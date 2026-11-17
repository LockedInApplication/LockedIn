import { expect, it } from "vitest";
import { readDiscoveryPhotoSelection } from "./discovery-photo-selection";

const MiB = 1024 * 1024;
function choose(type: string, size: number) {
  const file = new File([new Uint8Array(size)], "selected.jpeg", { type });
  const input = { value: "selected.jpeg", files: [file] as unknown as FileList };
  return { input, file };
}

it.each(["image/jpeg", "image/png", "image/webp"])("keeps a supported %s photo at the size limit", (type) => {
  const { input, file } = choose(type, 5 * MiB);
  expect(readDiscoveryPhotoSelection(input)).toEqual({ file, error: "" });
  expect(input.value).toBe("selected.jpeg");
});

it("explains the exact size rule and clears the rejected selection", () => {
  const { input } = choose("image/jpeg", 7 * MiB + MiB / 4);
  expect(readDiscoveryPhotoSelection(input)).toEqual({
    file: null, error: "This photo is 7.25 MiB. The limit is 5 MiB. Choose a smaller photo.",
  });
  expect(input.value).toBe("");
});

it("does not round an oversized file down to the displayed limit", () => {
  const { input } = choose("image/jpeg", 5 * MiB + 1);
  expect(readDiscoveryPhotoSelection(input).error).toContain("just over the 5 MiB limit");
  expect(input.value).toBe("");
});

it.each([
  ["image/heic", "format isn’t supported"],
  ["", "couldn’t identify the file format"],
])("explains a rejected MIME type (%s) even though the filename ends in .jpeg", (type, reason) => {
  const { input } = choose(type, 300);
  expect(readDiscoveryPhotoSelection(input)).toMatchObject({ file: null, error: expect.stringContaining(reason) });
  expect(input.value).toBe("");
});

it("explains an empty file but does not show an error when no file was picked", () => {
  const { input } = choose("image/jpeg", 0);
  expect(readDiscoveryPhotoSelection(input).error).toContain("file is empty");
  expect(input.value).toBe("");
  expect(readDiscoveryPhotoSelection({ files: null, value: "" })).toEqual({ file: null, error: "" });
});
