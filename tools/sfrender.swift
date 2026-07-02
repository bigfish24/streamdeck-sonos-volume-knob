import AppKit

// usage: sfrender <symbolName> <outPath> <sizePx>
let a = CommandLine.arguments
guard a.count >= 4, let px = Int(a[3]) else {
    FileHandle.standardError.write("usage: sfrender <symbol> <out.png> <size>\n".data(using: .utf8)!)
    exit(64)
}
let name = a[1], out = a[2]

guard let base = NSImage(systemSymbolName: name, accessibilityDescription: nil) else {
    FileHandle.standardError.write("symbol not found: \(name)\n".data(using: .utf8)!)
    exit(65)
}
let cfg = NSImage.SymbolConfiguration(pointSize: CGFloat(px) * 0.6, weight: .medium)
let symbol = (base.withSymbolConfiguration(cfg) ?? base)
symbol.isTemplate = true

guard let bmp = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { exit(66) }
bmp.size = NSSize(width: px, height: px)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bmp)
NSGraphicsContext.current?.imageInterpolation = .high

// fit the symbol into an inset box, centered, on a transparent canvas
let inset = CGFloat(px) * 0.14
let box = NSRect(x: inset, y: inset, width: CGFloat(px) - 2*inset, height: CGFloat(px) - 2*inset)
let s = symbol.size
let scale = min(box.width / s.width, box.height / s.height)
let w = s.width * scale, h = s.height * scale
let dst = NSRect(x: (CGFloat(px) - w)/2, y: (CGFloat(px) - h)/2, width: w, height: h)
symbol.draw(in: dst)

// recolor everything drawn to pure white, preserving alpha
NSColor.white.set()
NSRect(x: 0, y: 0, width: px, height: px).fill(using: .sourceAtop)
NSGraphicsContext.restoreGraphicsState()

guard let data = bmp.representation(using: .png, properties: [:]) else { exit(67) }
do { try data.write(to: URL(fileURLWithPath: out)); print("wrote \(out) [\(px)px] <- \(name)") }
catch { FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!); exit(68) }
