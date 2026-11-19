using System;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace LibraryPos.QuickBooksBridge
{
    internal static class Program
    {
        private const string SdkCountryEnvironmentVariable = "QBFC_SDK_COUNTRY";
        private const string BridgeSecretEnvironmentVariable = "QB_BRIDGE_SECRET";
        private const string BridgePortEnvironmentVariable = "QB_BRIDGE_PORT";

        [STAThread]
        private static int Main(string[] args)
        {
            string sdkCountry = Environment.GetEnvironmentVariable(SdkCountryEnvironmentVariable);
            if (String.IsNullOrWhiteSpace(sdkCountry) || !Regex.IsMatch(sdkCountry, "^[A-Za-z]{2}$"))
            {
                WriteFailure("SDK_COUNTRY_REQUIRED", "Set QBFC_SDK_COUNTRY to the two-letter locale of the installed QuickBooks Desktop edition.");
                return 2;
            }

            if (args.Length != 1)
            {
                WriteUsage();
                return 2;
            }

            if (String.Equals(args[0], "--company-query", StringComparison.Ordinal))
            {
                return RunCompanyQuery(sdkCountry);
            }

            if (String.Equals(args[0], "--preferences-query", StringComparison.Ordinal))
            {
                return RunPreferencesQuery(sdkCountry);
            }

            if (String.Equals(args[0], "--catalogs-query", StringComparison.Ordinal))
            {
                return RunCatalogsQuery(sdkCountry);
            }

            if (String.Equals(args[0], "--serve", StringComparison.Ordinal))
            {
                return RunServer(sdkCountry);
            }

            WriteUsage();
            return 2;
        }

        private static int RunCompanyQuery(string sdkCountry)
        {
            try
            {
                CompanyInfo company = QuickBooksCompanyQuery.Execute(sdkCountry);
                Version interopVersion = typeof(Interop.QBFC18.QBSessionManagerClass).Assembly.GetName().Version;
                Console.WriteLine(
                    "{\"success\":true,\"code\":\"COMPANY_QUERY_OK\",\"qbfcVersion\":\"" +
                    EscapeJson(interopVersion == null ? "unknown" : interopVersion.ToString()) +
                    "\",\"qbxmlVersion\":\"" + EscapeJson(company.QbxmlVersion) +
                    "\",\"companyIdentityKey\":\"" + EscapeJson(company.IdentityKey) +
                    "\",\"companyDataReturned\":true}"
                );
                return 0;
            }
            catch (QuickBooksBridgeException error)
            {
                WriteFailure(error.Code, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteFailure("COMPANY_QUERY_ERROR", error.GetType().Name + ": " + error.Message);
                return 1;
            }
        }

        private static int RunServer(string sdkCountry)
        {
            string secret = Environment.GetEnvironmentVariable(BridgeSecretEnvironmentVariable);
            if (String.IsNullOrEmpty(secret) || System.Text.Encoding.UTF8.GetByteCount(secret) < 32)
            {
                WriteFailure("BRIDGE_SECRET_INVALID", "QB_BRIDGE_SECRET must contain at least 32 UTF-8 bytes.");
                return 2;
            }

            int port = 8765;
            string portValue = Environment.GetEnvironmentVariable(BridgePortEnvironmentVariable);
            if (!String.IsNullOrWhiteSpace(portValue) &&
                (!Int32.TryParse(portValue, out port) || port < 1024 || port > 65535))
            {
                WriteFailure("BRIDGE_PORT_INVALID", "QB_BRIDGE_PORT must be an integer from 1024 through 65535.");
                return 2;
            }

            try
            {
                new LocalBridgeServer(port, secret, sdkCountry).Run();
                return 0;
            }
            catch (Exception error)
            {
                WriteFailure("BRIDGE_STARTUP_ERROR", error.GetType().Name + ": " + error.Message);
                return 1;
            }
        }

        private static int RunPreferencesQuery(string sdkCountry)
        {
            try
            {
                QuickBooksPreferencesInfo preferences = QuickBooksPreferencesQuery.Execute(sdkCountry);
                Console.WriteLine(
                    "{\"success\":true,\"code\":\"PREFERENCES_QUERY_OK\",\"multiCurrencyEnabled\":" +
                    (preferences.MultiCurrencyEnabled ? "true" : "false") +
                    ",\"homeCurrencyReferenceAvailable\":" +
                    (preferences.HomeCurrencyReferenceAvailable ? "true" : "false") +
                    ",\"homeCurrencyCode\":" +
                    (preferences.HomeCurrencyReferenceAvailable
                        ? "\"" + EscapeJson(preferences.HomeCurrencyCode) + "\""
                        : "null") +
                    ",\"homeCurrencyName\":" +
                    (preferences.HomeCurrencyReferenceAvailable
                        ? "\"" + EscapeJson(preferences.HomeCurrencyName) + "\""
                        : "null") + "}"
                );
                return 0;
            }
            catch (QuickBooksBridgeException error)
            {
                WriteFailure(error.Code, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteFailure("PREFERENCES_QUERY_ERROR", error.GetType().Name + ": " + error.Message);
                return 1;
            }
        }

        private static int RunCatalogsQuery(string sdkCountry)
        {
            try
            {
                QuickBooksCatalogsInfo catalogs = QuickBooksCatalogsQuery.Execute(sdkCountry);
                Console.WriteLine(
                    "{\"success\":true,\"code\":\"CATALOGS_QUERY_OK\",\"counts\":{" +
                    "\"items\":" + catalogs.Items.Count +
                    ",\"customers\":" + catalogs.Customers.Count +
                    ",\"salesTaxCodes\":" + catalogs.SalesTaxCodes.Count +
                    ",\"salesTaxItems\":" + catalogs.SalesTaxItems.Count +
                    ",\"paymentMethods\":" + catalogs.PaymentMethods.Count +
                    ",\"accounts\":" + catalogs.Accounts.Count +
                    "},\"truncated\":{" +
                    "\"items\":" + (catalogs.ItemsTruncated ? "true" : "false") +
                    ",\"customers\":" + (catalogs.CustomersTruncated ? "true" : "false") +
                    ",\"salesTaxCodes\":" + (catalogs.SalesTaxCodesTruncated ? "true" : "false") +
                    ",\"salesTaxItems\":" + (catalogs.SalesTaxItemsTruncated ? "true" : "false") +
                    ",\"paymentMethods\":" + (catalogs.PaymentMethodsTruncated ? "true" : "false") +
                    ",\"accounts\":" + (catalogs.AccountsTruncated ? "true" : "false") + "}}"
                );
                return 0;
            }
            catch (QuickBooksBridgeException error)
            {
                WriteFailure(error.Code, error.Message);
                return 1;
            }
            catch (Exception error)
            {
                WriteFailure("CATALOGS_QUERY_ERROR", error.GetType().Name + ": " + error.Message);
                return 1;
            }
        }

        private static void WriteUsage()
        {
            Console.Error.WriteLine("Usage: QuickBooksBridge.exe --company-query | --preferences-query | --catalogs-query | --serve");
        }

        private static void WriteFailure(string code, string message)
        {
            Console.Error.WriteLine(
                "{\"success\":false,\"code\":\"" + EscapeJson(code) +
                "\",\"message\":\"" + EscapeJson(Sanitize(message)) + "\"}"
            );
        }

        internal static string Sanitize(string value)
        {
            if (String.IsNullOrEmpty(value))
            {
                return "No additional details.";
            }

            string sanitized = Regex.Replace(value, @"[A-Za-z]:\\[^\r\n\t""]+", "[path]");
            return sanitized.Length <= 400 ? sanitized : sanitized.Substring(0, 400);
        }

        internal static string EscapeJson(string value)
        {
            StringBuilder escaped = new StringBuilder();
            foreach (char character in value ?? "")
            {
                switch (character)
                {
                    case '"':
                        escaped.Append("\\\"");
                        break;
                    case '\\':
                        escaped.Append("\\\\");
                        break;
                    case '\b':
                        escaped.Append("\\b");
                        break;
                    case '\f':
                        escaped.Append("\\f");
                        break;
                    case '\n':
                        escaped.Append("\\n");
                        break;
                    case '\r':
                        escaped.Append("\\r");
                        break;
                    case '\t':
                        escaped.Append("\\t");
                        break;
                    default:
                        if (character < 0x20)
                        {
                            escaped.Append("\\u");
                            escaped.Append(((int)character).ToString("x4"));
                        }
                        else
                        {
                            escaped.Append(character);
                        }
                        break;
                }
            }
            return escaped.ToString();
        }
    }
}
