import { inflateRawSync } from "node:zlib";
export function safePath(value: string) {
  if (
    !value ||
    value.length > 512 ||
    value.startsWith("/") ||
    /[\\\x00-\x1f:]/.test(value) ||
    value
      .split("/")
      .some((part) => part === ".." || part === "." || part === "") ||
    value.toLowerCase() === ".hivepanel" ||
    value.toLowerCase().startsWith(".hivepanel/")
  )
    throw new Error("Unsafe archive path");
  return value;
}
export function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(files: Record<string, Buffer>) {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [raw, data] of Object.entries(files)) {
    const name = Buffer.from(safePath(raw));
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function unzip(data: Buffer): Record<string, Buffer> {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6))
    throw new Error("Unsupported ZIP archive");
  const count = data.readUInt16LE(end + 10);
  if (count > 3000) throw new Error("Too many pack files");
  let cursor = data.readUInt32LE(end + 16),
    total = 0;
  const files: Record<string, Buffer> = Object.create(null);
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("Invalid ZIP directory");
    const flags = data.readUInt16LE(cursor + 8),
      method = data.readUInt16LE(cursor + 10),
      compressed = data.readUInt32LE(cursor + 20),
      size = data.readUInt32LE(cursor + 24),
      names = data.readUInt16LE(cursor + 28),
      extras = data.readUInt16LE(cursor + 30),
      comments = data.readUInt16LE(cursor + 32),
      position = data.readUInt32LE(cursor + 42),
      expectedCRC = data.readUInt32LE(cursor + 16);
    const name = data
      .subarray(cursor + 46, cursor + 46 + names)
      .toString("utf8");
    cursor += 46 + names + extras + comments;
    if (name.endsWith("/")) continue;
    safePath(name);
    if (
      flags & 1 ||
      size > 16 * 1024 * 1024 ||
      compressed === 0xffffffff ||
      ![0, 8].includes(method)
    )
      throw new Error("Unsupported or oversized ZIP entry");
    total += size;
    if (total > 64 * 1024 * 1024) throw new Error("Pack overrides too large");
    if (
      position + 30 > data.length ||
      data.readUInt32LE(position) !== 0x04034b50
    )
      throw new Error("Invalid ZIP entry");
    const start =
      position +
      30 +
      data.readUInt16LE(position + 26) +
      data.readUInt16LE(position + 28);
    if (start + compressed > data.length)
      throw new Error("Truncated ZIP entry");
    const raw = data.subarray(start, start + compressed),
      output =
        method === 0
          ? Buffer.from(raw)
          : inflateRawSync(raw, { maxOutputLength: Math.max(1, size) });
    if (
      output.length !== size ||
      crc32(output) !== expectedCRC ||
      Object.hasOwn(files, name)
    )
      throw new Error("Invalid ZIP content");
    files[name] = output;
  }
  return files;
}
