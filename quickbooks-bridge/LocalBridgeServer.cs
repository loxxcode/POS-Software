using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class LocalBridgeServer
    {
        private readonly int _port;
        private readonly string _secret;
        private readonly string _sdkCountry;
        private volatile bool _stopping;
        private HttpListener _listener;

        internal LocalBridgeServer(int port, string secret, string sdkCountry)
        {
            _port = port;
            _secret = secret;
            _sdkCountry = sdkCountry;
        }

        internal void Run()
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add("http://127.0.0.1:" + _port + "/");
            Console.CancelKeyPress += OnCancelKeyPress;

            try
            {
                _listener.Start();
                Console.WriteLine("QuickBooks bridge listening on http://127.0.0.1:" + _port + "/");

                while (!_stopping)
                {
                    HttpListenerContext context;
                    try
                    {
                        context = _listener.GetContext();
                    }
                    catch (HttpListenerException)
                    {
                        if (_stopping)
                        {
                            break;
                        }
                        throw;
                    }

                    HandleRequest(context);
                }
            }
            finally
            {
                Console.CancelKeyPress -= OnCancelKeyPress;
                if (_listener.IsListening)
                {
                    _listener.Stop();
                }
                _listener.Close();
                Console.WriteLine("QuickBooks bridge stopped.");
            }
        }

        private void HandleRequest(HttpListenerContext context)
        {
            HttpListenerResponse response = context.Response;
            try
            {
                if (!HasValidSecret(context.Request.Headers["X-Bridge-Token"]))
                {
                    WriteJson(response, 401, Failure("BRIDGE_AUTH_REQUIRED", "A valid backend-to-bridge token is required."));
                    return;
                }

                string path = context.Request.Url.AbsolutePath.TrimEnd('/');
                if (path.Length == 0)
                {
                    path = "/";
                }

                if (String.Equals(context.Request.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase))
                {
                    if (context.Request.ContentLength64 > 0 || context.Request.HasEntityBody)
                    {
                        WriteJson(response, 413, Failure("REQUEST_BODY_NOT_SUPPORTED", "GET endpoints do not accept a request body."));
                        return;
                    }
                    HandleGet(path, response);
                    return;
                }

                if (context.Request.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase) ||
                    context.Request.HttpMethod.Equals("PATCH", StringComparison.OrdinalIgnoreCase))
                {
                    if (context.Request.ContentLength64 > 16384)
                    {
                        WriteJson(response, 413, Failure("REQUEST_BODY_TOO_LARGE", "The request body exceeds the allowed size."));
                        return;
                    }
                    HandleMasterDataWrite(context.Request, response, path);
                    return;
                }

                response.Headers["Allow"] = "GET, POST, PATCH";
                WriteJson(response, 405, Failure("METHOD_NOT_ALLOWED", "This bridge endpoint does not support that HTTP method."));
            }
            catch (QuickBooksBridgeException error)
            {
                Console.Error.WriteLine("QuickBooks bridge operation failed: " + error.Code + " " + Program.Sanitize(error.Message));
                WriteJson(response, error.StatusCode, Failure(error.Code, error.Message));
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("QuickBooks bridge request failed: " + error.GetType().Name + " " + Program.Sanitize(error.Message));
                WriteJson(response, 500, Failure("BRIDGE_REQUEST_FAILED", "The bridge could not complete the request."));
            }
            finally
            {
                response.Close();
            }
        }

        private void HandleGet(string path, HttpListenerResponse response)
        {
            if (String.Equals(path, "/health", StringComparison.Ordinal))
            {
                WriteJson(response, 200, "{\"success\":true,\"service\":\"quickbooks-bridge\",\"status\":\"ready\"}");
                return;
            }

            if (String.Equals(path, "/quickbooks/capabilities", StringComparison.Ordinal))
            {
                WriteJson(
                    response,
                    200,
                    "{\"success\":true,\"operations\":[\"companyQuery\",\"preferencesQuery\",\"catalogsQuery\",\"customerAdd\",\"customerMod\",\"inventoryItemMod\"],\"salesReceiptsEnabled\":false,\"transactionWritesEnabled\":false,\"quickBooksDeleteEnabled\":false}"
                );
                return;
            }

            if (String.Equals(path, "/quickbooks/company", StringComparison.Ordinal))
            {
                CompanyInfo company = QuickBooksCompanyQuery.Execute(_sdkCountry);
                WriteJson(
                    response,
                    200,
                    "{\"success\":true,\"data\":{\"companyName\":\"" +
                    Program.EscapeJson(company.Name) +
                    "\",\"legalCompanyName\":\"" + Program.EscapeJson(company.LegalName) +
                    "\",\"country\":\"" + Program.EscapeJson(company.Country) +
                    "\",\"isSampleCompany\":" + (company.IsSampleCompany ? "true" : "false") +
                    ",\"companyIdentityKey\":\"" + Program.EscapeJson(company.IdentityKey) +
                    "\",\"qbxmlVersion\":\"" + Program.EscapeJson(company.QbxmlVersion) + "\"}}"
                );
                return;
            }

            if (String.Equals(path, "/quickbooks/catalogs", StringComparison.Ordinal))
            {
                QuickBooksCatalogsInfo catalogs = QuickBooksCatalogsQuery.Execute(_sdkCountry);
                WriteJson(response, 200, catalogs.ToJson());
                return;
            }

            if (String.Equals(path, "/quickbooks/preferences", StringComparison.Ordinal))
            {
                QuickBooksPreferencesInfo preferences = QuickBooksPreferencesQuery.Execute(_sdkCountry);
                WriteJson(
                    response,
                    200,
                    "{\"success\":true,\"data\":{\"multiCurrencyEnabled\":" +
                    (preferences.MultiCurrencyEnabled ? "true" : "false") +
                    ",\"homeCurrencyReferenceAvailable\":" +
                    (preferences.HomeCurrencyReferenceAvailable ? "true" : "false") +
                    ",\"homeCurrencyCode\":" +
                    (preferences.HomeCurrencyReferenceAvailable
                        ? "\"" + Program.EscapeJson(preferences.HomeCurrencyCode) + "\""
                        : "null") +
                    ",\"homeCurrencyName\":" +
                    (preferences.HomeCurrencyReferenceAvailable
                        ? "\"" + Program.EscapeJson(preferences.HomeCurrencyName) + "\""
                        : "null") + "}}"
                );
                return;
            }

            WriteJson(response, 404, Failure("NOT_FOUND", "Bridge endpoint not found."));
        }

        private void HandleMasterDataWrite(HttpListenerRequest request, HttpListenerResponse response, string path)
        {
            string contentType = (request.ContentType ?? "").Split(';')[0].Trim();
            if (!String.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                WriteJson(response, 415, Failure("JSON_REQUIRED", "Master-data changes require an application/json body."));
                return;
            }

            Dictionary<string, object> values;
            int bodyStatus;
            string bodyError;
            if (!TryReadJsonObject(request, out values, out bodyStatus, out bodyError))
            {
                WriteJson(response, bodyStatus, Failure(bodyError, bodyError == "REQUEST_BODY_TOO_LARGE"
                    ? "The request body exceeds the allowed size."
                    : "The request body must be a JSON object."));
                return;
            }

            if (values == null)
            {
                WriteJson(response, 400, Failure("INVALID_JSON", "The request body must be a JSON object."));
                return;
            }

            string method = request.HttpMethod.ToUpperInvariant();
            QuickBooksMasterDataResult result;
            if (method == "POST" && path == "/quickbooks/customers")
            {
                string name = RequiredString(values, "name", 41);
                result = QuickBooksMasterData.AddCustomer(
                    _sdkCountry,
                    name,
                    OptionalString(values, "email", 254),
                    OptionalString(values, "phone", 30),
                    OptionalString(values, "address", 205)
                );
            }
            else if (method == "PATCH" && path.StartsWith("/quickbooks/customers/", StringComparison.Ordinal))
            {
                string listId = DecodeListId(path, "/quickbooks/customers/");
                result = QuickBooksMasterData.UpdateCustomer(
                    _sdkCountry,
                    listId,
                    RequiredString(values, "name", 41),
                    OptionalString(values, "email", 254),
                    OptionalString(values, "phone", 30),
                    OptionalString(values, "address", 205)
                );
            }
            else if (method == "PATCH" && path.StartsWith("/quickbooks/items/", StringComparison.Ordinal))
            {
                string listId = DecodeListId(path, "/quickbooks/items/");
                string name = RequiredString(values, "name", 31);
                double salesPrice = RequiredNumber(values, "salesPrice");
                if (salesPrice < 0 || salesPrice > 1000000000)
                {
                    WriteJson(response, 400, Failure("INVALID_SALES_PRICE", "salesPrice must be a non-negative amount."));
                    return;
                }
                result = QuickBooksMasterData.UpdateInventoryItem(_sdkCountry, listId, name, salesPrice);
            }
            else
            {
                response.Headers["Allow"] = "GET, POST, PATCH";
                WriteJson(response, 404, Failure("NOT_FOUND", "Bridge endpoint not found."));
                return;
            }

            WriteJson(
                response,
                200,
                "{\"success\":true,\"data\":{\"listId\":\"" + Program.EscapeJson(result.ListId) +
                "\",\"name\":\"" + Program.EscapeJson(result.Name) + "\"}}"
            );
        }

        private static string DecodeListId(string path, string prefix)
        {
            string value = Uri.UnescapeDataString(path.Substring(prefix.Length));
            if (String.IsNullOrWhiteSpace(value) || value.Contains("/") || value.Length > 100)
            {
                throw new QuickBooksBridgeException("INVALID_LIST_ID", "A valid QuickBooks ListID is required.", 400);
            }
            return value;
        }

        private static string RequiredString(Dictionary<string, object> values, string key, int maximumLength)
        {
            string value = OptionalString(values, key, maximumLength);
            if (String.IsNullOrWhiteSpace(value))
            {
                throw new QuickBooksBridgeException("INVALID_MASTER_DATA", key + " is required.", 400);
            }
            return value;
        }

        private static string OptionalString(Dictionary<string, object> values, string key, int maximumLength)
        {
            object raw;
            if (!values.TryGetValue(key, out raw) || raw == null)
            {
                return "";
            }
            string value = raw as string;
            if (value == null || value.Length > maximumLength)
            {
                throw new QuickBooksBridgeException("INVALID_MASTER_DATA", key + " must be a string within the allowed length.", 400);
            }
            return value.Trim();
        }

        private static double RequiredNumber(Dictionary<string, object> values, string key)
        {
            object raw;
            double value;
            if (!values.TryGetValue(key, out raw) || raw == null ||
                !Double.TryParse(Convert.ToString(raw, System.Globalization.CultureInfo.InvariantCulture),
                    System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out value) ||
                Double.IsNaN(value) ||
                Double.IsInfinity(value))
            {
                throw new QuickBooksBridgeException("INVALID_MASTER_DATA", key + " must be a finite number.", 400);
            }
            return value;
        }

        private static bool TryReadJsonObject(
            HttpListenerRequest request,
            out Dictionary<string, object> values,
            out int statusCode,
            out string errorCode
        )
        {
            values = null;
            statusCode = 400;
            errorCode = "INVALID_JSON";
            using (MemoryStream buffer = new MemoryStream())
            {
                byte[] chunk = new byte[4096];
                int read;
                while ((read = request.InputStream.Read(chunk, 0, chunk.Length)) > 0)
                {
                    if (buffer.Length + read > 16384)
                    {
                        statusCode = 413;
                        errorCode = "REQUEST_BODY_TOO_LARGE";
                        return false;
                    }
                    buffer.Write(chunk, 0, read);
                }

                try
                {
                    string body = Encoding.UTF8.GetString(buffer.ToArray());
                    values = new JavaScriptSerializer { MaxJsonLength = 16384 }
                        .Deserialize<Dictionary<string, object>>(body);
                    return values != null;
                }
                catch (ArgumentException)
                {
                    return false;
                }
                catch (InvalidOperationException)
                {
                    return false;
                }
            }
        }

        private bool HasValidSecret(string supplied)
        {
            byte[] expectedBytes = Encoding.UTF8.GetBytes(_secret);
            byte[] suppliedBytes = Encoding.UTF8.GetBytes(supplied ?? "");
            int difference = expectedBytes.Length ^ suppliedBytes.Length;
            int length = Math.Max(expectedBytes.Length, suppliedBytes.Length);

            for (int index = 0; index < length; index++)
            {
                byte expected = index < expectedBytes.Length ? expectedBytes[index] : (byte)0;
                byte actual = index < suppliedBytes.Length ? suppliedBytes[index] : (byte)0;
                difference |= expected ^ actual;
            }

            return difference == 0;
        }

        private static string Failure(string code, string message)
        {
            return "{\"success\":false,\"code\":\"" + Program.EscapeJson(code) +
                "\",\"message\":\"" + Program.EscapeJson(Program.Sanitize(message)) + "\"}";
        }

        private static void WriteJson(HttpListenerResponse response, int statusCode, string json)
        {
            byte[] body = Encoding.UTF8.GetBytes(json);
            response.StatusCode = statusCode;
            response.ContentType = "application/json; charset=utf-8";
            response.ContentLength64 = body.Length;
            response.OutputStream.Write(body, 0, body.Length);
        }

        private void OnCancelKeyPress(object sender, ConsoleCancelEventArgs eventArgs)
        {
            eventArgs.Cancel = true;
            _stopping = true;
            _listener.Stop();
        }
    }
}
