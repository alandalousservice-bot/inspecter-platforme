import { Buffer } from 'node:buffer';
// Synthetic TIFF with a real GPS IFD pointer and orientation=6; never a real photo/location.
export function withSyntheticGpsExif(jpeg) {
  const tiff = Buffer.alloc(140); tiff.write('II'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  const entry = (offset, tag, type, count, value) => { tiff.writeUInt16LE(tag, offset); tiff.writeUInt16LE(type, offset + 2); tiff.writeUInt32LE(count, offset + 4); tiff.writeUInt32LE(value, offset + 8); };
  tiff.writeUInt16LE(2, 8); entry(10, 0x0112, 3, 1, 6); entry(22, 0x8825, 4, 1, 38);
  tiff.writeUInt16LE(4, 38); entry(40, 1, 2, 2, 78); entry(52, 2, 5, 3, 92); entry(64, 3, 2, 2, 69); entry(76, 4, 5, 3, 116);
  for (const offset of [92,116]) { tiff.writeUInt32LE(1, offset); tiff.writeUInt32LE(1, offset + 4); tiff.writeUInt32LE(1, offset + 12); tiff.writeUInt32LE(1, offset + 20); }
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff]); const marker = Buffer.alloc(4); marker.writeUInt16BE(0xffe1); marker.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0,2), marker, exif, jpeg.subarray(2)]);
}
