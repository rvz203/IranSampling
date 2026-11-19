export function parseOrigin(value: string, allowHttp: boolean) {
  // React Native's built-in URL implementation differs across versions.
  const match =
    /^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?\/?$/i.exec(
      value.trim(),
    );
  if (
    !match ||
    !match[1] ||
    !match[2] ||
    (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535))
  ) {
    throw new Error(
      "نشانی اصلی سرور را مانند https://sampling.example.com وارد کنید.",
    );
  }
  const scheme = match[1].toLowerCase();
  if (scheme === "http" && !allowHttp)
    throw new Error("نشانی سرور باید با HTTPS شروع شود.");
  return `${scheme}://${match[2].toLowerCase()}${match[3] ? `:${Number(match[3])}` : ""}`;
}
