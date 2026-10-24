// Small fetch helper for the result subject configuration endpoints (/api/results/...).
// Resolves with the response payload and throws an Error carrying the server message.
export const resultsRequest = async (API, token, path, { method = "GET", body } = {}) => {
  const res = await fetch(`${API}/results${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data?.data ?? data;
};

export const subjectKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

export const MAX_MARKS_LIMIT = 1000;

export const isValidMaxMarks = (value) => {
  const num = Number(value);
  return value !== "" && value !== null && Number.isFinite(num) && num > 0 && num <= MAX_MARKS_LIMIT;
};
