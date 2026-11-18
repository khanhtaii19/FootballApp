/**
 * Tạo chuỗi QR VietQR (chuẩn EMVCo + NAPAS 247, chuyển nhanh tới số tài khoản).
 * Khách quét bằng app ngân hàng bất kỳ; số tiền và nội dung được điền sẵn.
 * Phía client chỉ cần vẽ chuỗi này thành ảnh QR (ví dụ bằng qrcode.react).
 */

/** Một trường TLV: mã (2 ký tự) + độ dài (2 chữ số) + giá trị. */
function tlv(id: string, value: string): string {
  if (value.length > 99) {
    throw new Error(`Trường ${id} dài quá 99 ký tự`);
  }
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), trả về 4 ký tự hex in hoa. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface VietQrInput {
  bin: string; // Mã BIN ngân hàng nhận tiền (6 số), ví dụ 970436
  accountNo: string; // Số tài khoản
  amount: number; // VND, số nguyên dương
  content: string; // Nội dung chuyển khoản, chữ không dấu/số, tối đa 25 ký tự
}

export function buildVietQrPayload(input: VietQrInput): string {
  const { bin, accountNo, amount, content } = input;

  if (!/^\d{6}$/.test(bin)) throw new Error("Mã BIN phải gồm 6 chữ số");
  if (!/^\d{6,19}$/.test(accountNo)) {
    throw new Error("Số tài khoản phải gồm 6–19 chữ số");
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Số tiền phải là số nguyên dương");
  }
  if (!/^[A-Za-z0-9 ]{1,25}$/.test(content)) {
    throw new Error("Nội dung chỉ gồm chữ không dấu, số, khoảng trắng (tối đa 25 ký tự)");
  }

  // Tài khoản thụ hưởng: BIN + số tài khoản
  const beneficiary = tlv("00", bin) + tlv("01", accountNo);

  // Thông tin merchant của NAPAS: GUID + thụ hưởng + dịch vụ "chuyển tới tài khoản"
  const merchantInfo =
    tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");

  const body =
    tlv("00", "01") + // phiên bản payload
    tlv("01", "12") + // QR động (có số tiền)
    tlv("38", merchantInfo) +
    tlv("53", "704") + // VND
    tlv("54", String(amount)) +
    tlv("58", "VN") +
    tlv("62", tlv("08", content)) + // nội dung chuyển khoản
    "6304"; // mã CRC: tính trên toàn bộ chuỗi, gồm cả "6304"

  return body + crc16(body);
}

/** Tách chuỗi TLV phẳng thành object { mã: giá trị } (phục vụ kiểm tra/test). */
export function parseTlv(payload: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const length = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(length)) {
      throw new Error("Chuỗi TLV không hợp lệ");
    }
    result[id] = payload.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return result;
}

/** Kiểm tra 4 ký tự CRC cuối khớp với phần còn lại của chuỗi. */
export function verifyVietQrCrc(payload: string): boolean {
  if (payload.length < 8) return false;
  return crc16(payload.slice(0, -4)) === payload.slice(-4);
}
