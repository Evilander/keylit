/*! Bounded reader adapted from lz-string.
 * MIT License
 *
 * Copyright (c) 2013 pieroxy
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

export function decompressShare(payload, maxLength) {
  const input = payload.replace(/ /g, "+");
  if (!input || !/^[A-Za-z0-9+\-$]+$/.test(input)) return null;
  let value = ALPHABET.indexOf(input[0]), position = 32, index = 1;
  const readBits = (count) => {
    let bits = 0;
    for (let i = 0; i < count; i++) {
      if (value & position) bits += 2 ** i;
      position >>= 1;
      if (!position) {
        position = 32;
        value = ALPHABET.indexOf(input[index++]);
      }
    }
    return bits;
  };
  const initial = readBits(2);
  if (initial === 2) return "";
  if (initial > 1) return null;
  let previous = String.fromCharCode(readBits(initial === 0 ? 8 : 16));
  const dictionary = [null, null, null, previous];
  const parts = [previous];
  let length = previous.length, size = 4, bits = 3, enlargeIn = 4;
  while (index <= input.length) {
    let code = readBits(bits);
    if (code === 2) return parts.join("");
    if (code === 0 || code === 1) {
      dictionary[size++] = String.fromCharCode(readBits(code === 0 ? 8 : 16));
      code = size - 1;
      enlargeIn--;
    }
    if (!enlargeIn) { enlargeIn = 2 ** bits; bits++; }
    let entry = dictionary[code];
    if (entry == null) {
      if (code !== size || previous.length + 1 > maxLength) return null;
      entry = previous + previous[0];
    }
    length += entry.length;
    if (length > maxLength) return null;
    parts.push(entry);
    dictionary[size++] = previous + entry[0];
    enlargeIn--;
    previous = entry;
    if (!enlargeIn) { enlargeIn = 2 ** bits; bits++; }
  }
  return null;
}
