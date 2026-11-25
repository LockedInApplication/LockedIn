import CryptoKit
import Foundation
import Security

typealias SigningKey = Curve25519.Signing.PrivateKey

#if LOCKEDIN_WEEKLY_REPORT
let keyService = "LockedIn Weekly Report Signing"
let keyAccount = "lockedin_weekly_report"
let reportAudience = "lockedin.weekly-app-report.v1"
let reportTarget = #"^/internal/lockedin-report(?:\?week=[0-9]{4}-[0-9]{2}-[0-9]{2})?$"#
#else
let keyService = "LockedIn Together Report Signing"
let keyAccount = "lockedin_together_report"
let reportAudience = "lockedin.together-report.v1"
let reportTarget = #"^/internal/together-report(?:\?week=[0-9]{4}-[0-9]{2}-[0-9]{2})?$"#
#endif

let item = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: keyService,
    kSecAttrAccount as String: keyAccount
] as [String: Any]

func keyFromKeychain() throws -> SigningKey {
    var query = item
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess, let bytes = value as? Data else {
        throw CocoaError(.fileReadNoPermission)
    }
    return try SigningKey(rawRepresentation: bytes)
}

func printPublicKey(_ key: SigningKey) {
    // DER SubjectPublicKeyInfo prefix for a 32-byte Ed25519 verification key.
    let prefix = Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00])
    print((prefix + key.publicKey.rawRepresentation).base64EncodedString())
}

func isReportRequest(_ request: Data) -> Bool {
    guard let text = String(data: request, encoding: .utf8) else { return false }
    let parts = text.components(separatedBy: "\n")
    guard parts.count == 6, parts[0] == reportAudience,
          parts[1] == "https://lockedin-9yon.onrender.com", parts[2] == "GET",
          parts[3].range(of: reportTarget, options: .regularExpression) != nil,
          parts[4].range(of: #"^[1-9][0-9]{9}$"#, options: .regularExpression) != nil,
          parts[5].range(of: #"^[A-Za-z0-9_-]{22}$"#, options: .regularExpression) != nil,
          let time = Double(parts[4]), abs(Date().timeIntervalSince1970 - time) < 60 else {
        return false
    }
    return true
}

do {
    guard CommandLine.arguments.count == 2 else { exit(2) }
    switch CommandLine.arguments[1] {
    case "create":
        let key = SigningKey()
        var attributes = item
        attributes[kSecValueData as String] = key.rawRepresentation
        // No overwrite: replacing a key requires an intentional rotation.
        guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { exit(3) }
        printPublicKey(key)
    case "public":
        printPublicKey(try keyFromKeychain())
    case "sign":
        let input = try FileHandle.standardInput.read(upToCount: 513) ?? Data()
        guard input.count <= 512, isReportRequest(input) else { exit(2) }
        print(try keyFromKeychain().signature(for: input).base64EncodedString())
    default:
        exit(2)
    }
} catch {
    exit(3)
}
