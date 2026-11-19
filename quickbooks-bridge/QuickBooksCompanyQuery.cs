using System;
using System.Runtime.InteropServices;
using Interop.QBFC18;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class CompanyInfo
    {
        internal CompanyInfo(string name, string country, string qbxmlVersion)
        {
            Name = name;
            Country = country;
            QbxmlVersion = qbxmlVersion;
        }

        internal string Name { get; private set; }
        internal string Country { get; private set; }
        internal string QbxmlVersion { get; private set; }
    }

    internal sealed class QuickBooksBridgeException : Exception
    {
        internal QuickBooksBridgeException(string code, string message, int statusCode = 502)
            : base(message)
        {
            Code = code;
            StatusCode = statusCode;
        }

        internal string Code { get; private set; }
        internal int StatusCode { get; private set; }
    }

    internal static class QuickBooksCompanyQuery
    {
        private const string ApplicationName = "Library POS QuickBooks Bridge";

        internal static CompanyInfo Execute(string sdkCountry)
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest requestSet = null;
            IAttributesRqSet requestAttributes = null;
            ICompanyQuery companyQuery = null;
            IMsgSetResponse responseSet = null;
            IResponseList responseList = null;
            IResponse response = null;
            ICompanyRet company = null;
            IAddress address = null;
            IQBStringType companyName = null;
            IQBStringType country = null;
            bool connectionOpened = false;
            bool sessionBegun = false;

            try
            {
                manager = new QBSessionManagerClass();
                manager.OpenConnection2("", ApplicationName, ENConnectionType.ctLocalQBD);
                connectionOpened = true;
                manager.BeginSession("", ENOpenMode.omDontCare);
                sessionBegun = true;

                short majorVersion;
                short minorVersion;
                string qbxmlVersion = SelectSupportedQbxmlVersion(
                    manager.QBXMLVersionsForSession,
                    out majorVersion,
                    out minorVersion
                );
                if (qbxmlVersion == null)
                {
                    throw new QuickBooksBridgeException(
                        "QBXML_VERSION_UNSUPPORTED",
                        "QuickBooks did not report a usable qbXML version for this session."
                    );
                }

                requestSet = manager.CreateMsgSetRequest(
                    sdkCountry.ToUpperInvariant(),
                    majorVersion,
                    minorVersion
                );
                requestAttributes = requestSet.Attributes;
                requestAttributes.OnError = ENRqOnError.roeStop;
                companyQuery = requestSet.AppendCompanyQueryRq();

                responseSet = manager.DoRequests(requestSet);
                responseList = responseSet.ResponseList;
                if (responseList.Count != 1)
                {
                    throw new QuickBooksBridgeException(
                        "COMPANY_QUERY_RESPONSE_INVALID",
                        "QuickBooks returned an unexpected response count."
                    );
                }

                response = responseList.GetAt(0);
                company = response.Detail as ICompanyRet;
                if (response.StatusCode != 0 || company == null)
                {
                    throw new QuickBooksBridgeException(
                        "COMPANY_QUERY_FAILED",
                        "QuickBooks status " + response.StatusCode + " (" +
                        Program.Sanitize(response.StatusSeverity) + "): " +
                        Program.Sanitize(response.StatusMessage)
                    );
                }

                string nameValue = "";
                companyName = company.CompanyName;
                if (companyName != null && companyName.IsSet())
                {
                    nameValue = companyName.GetValue();
                }

                string countryValue = "";
                address = company.Address;
                if (address != null)
                {
                    country = address.Country;
                    if (country != null && country.IsSet())
                    {
                        countryValue = country.GetValue();
                    }
                }

                return new CompanyInfo(nameValue, countryValue, qbxmlVersion);
            }
            catch (QuickBooksBridgeException)
            {
                throw;
            }
            catch (COMException error)
            {
                throw new QuickBooksBridgeException(
                    "QUICKBOOKS_COM_ERROR",
                    "HRESULT 0x" + error.ErrorCode.ToString("X8") + ": " + Program.Sanitize(error.Message)
                );
            }
            finally
            {
                QuickBooksBridgeException cleanupError = null;
                if (sessionBegun)
                {
                    try
                    {
                        manager.EndSession();
                    }
                    catch (COMException error)
                    {
                        cleanupError = new QuickBooksBridgeException(
                            "SESSION_CLOSE_ERROR",
                            "HRESULT 0x" + error.ErrorCode.ToString("X8")
                        );
                    }
                }

                if (connectionOpened)
                {
                    try
                    {
                        manager.CloseConnection();
                    }
                    catch (COMException error)
                    {
                        if (cleanupError == null)
                        {
                            cleanupError = new QuickBooksBridgeException(
                                "CONNECTION_CLOSE_ERROR",
                                "HRESULT 0x" + error.ErrorCode.ToString("X8")
                            );
                        }
                    }
                }

                ReleaseAll(
                    country,
                    companyName,
                    address,
                    company,
                    response,
                    responseList,
                    responseSet,
                    companyQuery,
                    requestAttributes,
                    requestSet,
                    manager
                );
                if (cleanupError != null)
                {
                    throw cleanupError;
                }
            }
        }

        internal static string SelectSupportedQbxmlVersion(string[] versions, out short major, out short minor)
        {
            major = 0;
            minor = 0;
            Version selected = null;

            if (versions != null)
            {
                foreach (string value in versions)
                {
                    Version candidate;
                    if (!Version.TryParse(value, out candidate) ||
                        candidate.Major < 1 ||
                        candidate.Major > Int16.MaxValue ||
                        candidate.Minor < 0 ||
                        candidate.Minor > Int16.MaxValue)
                    {
                        continue;
                    }

                    if (selected == null || candidate.CompareTo(selected) > 0)
                    {
                        selected = candidate;
                    }
                }
            }

            if (selected == null)
            {
                return null;
            }

            major = (short)selected.Major;
            minor = (short)selected.Minor;
            return selected.ToString(2);
        }

        private static void ReleaseAll(params object[] values)
        {
            foreach (object value in values)
            {
                if (value != null && Marshal.IsComObject(value))
                {
                    Marshal.FinalReleaseComObject(value);
                }
            }
        }
    }
}
