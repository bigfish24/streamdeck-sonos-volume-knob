import AppKit
import ImageIO
import UniformTypeIdentifiers

// usage: render-paused <volume@2x.png> <out.png>
// SF Symbols has no speaker+pause glyph, so composite one: reuse the speaker
// from the rendered volume icon (512px) and draw two rounded pause bars where
// the sound waves are.
let a = CommandLine.arguments
guard a.count >= 3 else {
    FileHandle.standardError.write("usage: render-paused <volume@2x.png> <out.png>\n".data(using: .utf8)!)
    exit(64)
}
let srcPath = a[1], out = a[2]

guard let nsimg = NSImage(contentsOfFile: srcPath) else {
    FileHandle.standardError.write("cannot load \(srcPath)\n".data(using: .utf8)!)
    exit(65)
}
var full = CGRect(x: 0, y: 0, width: 512, height: 512)
guard let cg = nsimg.cgImage(forProposedRect: &full, context: nil, hints: nil),
      let speaker = cg.cropping(to: CGRect(x: 0, y: 0, width: 252, height: 512)) else { exit(66) }

guard let ctx = CGContext(data: nil, width: 512, height: 512, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(66) }
ctx.draw(speaker, in: CGRect(x: 0, y: 0, width: 252, height: 512))
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.addPath(CGPath(roundedRect: CGRect(x: 292, y: 166, width: 44, height: 180), cornerWidth: 22, cornerHeight: 22, transform: nil))
ctx.addPath(CGPath(roundedRect: CGRect(x: 368, y: 166, width: 44, height: 180), cornerWidth: 22, cornerHeight: 22, transform: nil))
ctx.fillPath()

guard let img = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(67) }
CGImageDestinationAddImage(dest, img, nil)
guard CGImageDestinationFinalize(dest) else { exit(68) }
print("wrote \(out) [512px] <- \(srcPath) + pause bars")
