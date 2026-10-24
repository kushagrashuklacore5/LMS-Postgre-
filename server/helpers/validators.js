/**
 * Shape checks for values typed into forms.
 *
 * An account's email is its login name and the address its password reset goes to, so an
 * address that cannot receive mail must not be stored.
 */
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** True for a plausible email address of at most 254 characters. */
const isEmail = (value) => typeof value === "string" && value.length <= 254 && EMAIL.test(value.trim());

module.exports = { isEmail };
