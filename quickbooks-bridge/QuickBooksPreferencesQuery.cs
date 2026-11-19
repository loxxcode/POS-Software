using System;
using System.Runtime.InteropServices;
using Interop.QBFC18;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class QuickBooksPreferencesInfo
    {
        internal QuickBooksPreferencesInfo(bool multiCurrencyEnabled, string homeCurrencyCode, string homeCurrencyName)
        {
            MultiCurrencyEnabled = multiCurrencyEnabled;
            HomeCurrencyReferenceAvailable =
                !String.IsNullOrWhiteSpace(homeCurrencyCode) &&
                !String.IsNullOrWhiteSpace(homeCurrencyName);
            HomeCurrencyCode = homeCurrencyCode;
            HomeCurrencyName = homeCurrencyName;
        }

        internal bool MultiCurrencyEnabled { get; private set; }
        internal bool HomeCurrencyReferenceAvailable { get; private set; }
        internal string HomeCurrencyCode { get; private set; }
        internal string HomeCurrencyName { get; private set; }
    }

    internal static class QuickBooksPreferencesQuery
    {
        private const string ApplicationName = "Library POS QuickBooks Bridge";

        internal static QuickBooksPreferencesInfo Execute(string sdkCountry)
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest preferencesRequestSet = null;
            IAttributesRqSet preferencesRequestAttributes = null;
            IPreferencesQuery preferencesQuery = null;
            IMsgSetResponse preferencesResponseSet = null;
            IResponseList preferencesResponseList = null;
            IResponse preferencesResponse = null;
            IPreferencesRet preferences = null;
            IMultiCurrencyPreferences multiCurrency = null;
            IQBBoolType multiCurrencyValue = null;
            IQBBaseRef homeCurrency = null;
            IQBIDType homeCurrencyListId = null;
            IQBStringType homeCurrencyFullName = null;
            IMsgSetRequest currencyRequestSet = null;
            IAttributesRqSet currencyRequestAttributes = null;
            ICurrencyQuery currencyQuery = null;
            IORListQuery currencyListQuery = null;
            IBSTRList currencyListIds = null;
            IMsgSetResponse currencyResponseSet = null;
            IResponseList currencyResponseList = null;
            IResponse currencyResponse = null;
            ICurrencyRetList currencies = null;
            ICurrencyRet currency = null;
            IQBStringType currencyCode = null;
            IQBStringType currencyDisplayName = null;
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
                string qbxmlVersion = QuickBooksCompanyQuery.SelectSupportedQbxmlVersion(
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

                preferencesRequestSet = manager.CreateMsgSetRequest(
                    sdkCountry.ToUpperInvariant(),
                    majorVersion,
                    minorVersion
                );
                preferencesRequestAttributes = preferencesRequestSet.Attributes;
                preferencesRequestAttributes.OnError = ENRqOnError.roeStop;
                preferencesQuery = preferencesRequestSet.AppendPreferencesQueryRq();
                preferencesQuery.IncludeRetElementList.Add("MultiCurrencyPreferences");

                preferencesResponseSet = manager.DoRequests(preferencesRequestSet);
                preferencesResponseList = preferencesResponseSet.ResponseList;
                if (preferencesResponseList.Count != 1)
                {
                    throw new QuickBooksBridgeException(
                        "PREFERENCES_QUERY_RESPONSE_INVALID",
                        "QuickBooks returned an unexpected preferences response count."
                    );
                }

                preferencesResponse = preferencesResponseList.GetAt(0);
                preferences = preferencesResponse.Detail as IPreferencesRet;
                if (
                    (preferencesResponse.StatusCode != 0 && !IsInformationalNoMatch(preferencesResponse)) ||
                    preferences == null
                )
                {
                    throw new QuickBooksBridgeException(
                        "PREFERENCES_QUERY_FAILED",
                        "QuickBooks status " + preferencesResponse.StatusCode + " (" +
                        Program.Sanitize(preferencesResponse.StatusSeverity) + "): " +
                        Program.Sanitize(preferencesResponse.StatusMessage)
                    );
                }

                multiCurrency = preferences.MultiCurrencyPreferences;
                if (multiCurrency == null)
                {
                    throw new QuickBooksBridgeException(
                        "PREFERENCES_QUERY_INCOMPLETE",
                        "QuickBooks did not return multi-currency preferences."
                    );
                }

                multiCurrencyValue = multiCurrency.IsMultiCurrencyOn;
                homeCurrency = multiCurrency.HomeCurrencyRef;
                homeCurrencyListId = homeCurrency == null ? null : homeCurrency.ListID;
                homeCurrencyFullName = homeCurrency == null ? null : homeCurrency.FullName;
                if (multiCurrencyValue == null || !multiCurrencyValue.IsSet())
                {
                    throw new QuickBooksBridgeException(
                        "PREFERENCES_QUERY_INCOMPLETE",
                        "QuickBooks did not return whether multi-currency is enabled."
                    );
                }

                bool hasHomeCurrencyListId = homeCurrencyListId != null &&
                    homeCurrencyListId.IsSet() &&
                    !String.IsNullOrWhiteSpace(homeCurrencyListId.GetValue());
                bool hasHomeCurrencyFullName = homeCurrencyFullName != null &&
                    homeCurrencyFullName.IsSet() &&
                    !String.IsNullOrWhiteSpace(homeCurrencyFullName.GetValue());
                if (!hasHomeCurrencyListId && !hasHomeCurrencyFullName)
                {
                    return new QuickBooksPreferencesInfo(
                        multiCurrencyValue.GetValue(),
                        null,
                        null
                    );
                }

                currencyRequestSet = manager.CreateMsgSetRequest(
                    sdkCountry.ToUpperInvariant(),
                    majorVersion,
                    minorVersion
                );
                currencyRequestAttributes = currencyRequestSet.Attributes;
                currencyRequestAttributes.OnError = ENRqOnError.roeStop;
                currencyQuery = currencyRequestSet.AppendCurrencyQueryRq();
                currencyListQuery = currencyQuery.ORListQuery;
                if (hasHomeCurrencyListId)
                {
                    currencyListIds = currencyListQuery.ListIDList;
                    currencyListIds.Add(homeCurrencyListId.GetValue());
                }
                else
                {
                    currencyListIds = currencyListQuery.FullNameList;
                    currencyListIds.Add(homeCurrencyFullName.GetValue());
                }

                currencyResponseSet = manager.DoRequests(currencyRequestSet);
                currencyResponseList = currencyResponseSet.ResponseList;
                if (currencyResponseList.Count != 1)
                {
                    throw new QuickBooksBridgeException(
                        "HOME_CURRENCY_QUERY_RESPONSE_INVALID",
                        "QuickBooks returned an unexpected home-currency response count."
                    );
                }

                currencyResponse = currencyResponseList.GetAt(0);
                currencies = currencyResponse.Detail as ICurrencyRetList;
                if (IsInformationalNoMatch(currencyResponse))
                {
                    return new QuickBooksPreferencesInfo(
                        multiCurrencyValue.GetValue(),
                        null,
                        null
                    );
                }
                if (currencyResponse.StatusCode != 0 || currencies == null || currencies.Count != 1)
                {
                    throw new QuickBooksBridgeException(
                        "HOME_CURRENCY_QUERY_FAILED",
                        "QuickBooks status " + currencyResponse.StatusCode + " (" +
                        Program.Sanitize(currencyResponse.StatusSeverity) + "): " +
                        Program.Sanitize(currencyResponse.StatusMessage)
                    );
                }

                currency = currencies.GetAt(0);
                currencyCode = currency.CurrencyCode;
                currencyDisplayName = currency.Name;
                if (currencyCode == null || !currencyCode.IsSet() ||
                    currencyDisplayName == null || !currencyDisplayName.IsSet())
                {
                    throw new QuickBooksBridgeException(
                        "HOME_CURRENCY_QUERY_INCOMPLETE",
                        "QuickBooks did not return the home-currency code and name."
                    );
                }

                return new QuickBooksPreferencesInfo(
                    multiCurrencyValue.GetValue(),
                    currencyCode.GetValue(),
                    currencyDisplayName.GetValue()
                );
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
                    currencyDisplayName,
                    currencyCode,
                    currency,
                    currencies,
                    currencyResponse,
                    currencyResponseList,
                    currencyResponseSet,
                    currencyListIds,
                    currencyListQuery,
                    currencyQuery,
                    currencyRequestAttributes,
                    currencyRequestSet,
                    homeCurrencyFullName,
                    homeCurrencyListId,
                    homeCurrency,
                    multiCurrencyValue,
                    multiCurrency,
                    preferences,
                    preferencesResponse,
                    preferencesResponseList,
                    preferencesResponseSet,
                    preferencesQuery,
                    preferencesRequestAttributes,
                    preferencesRequestSet,
                    manager
                );
                if (cleanupError != null)
                {
                    throw cleanupError;
                }
            }
        }

        private static bool IsInformationalNoMatch(IResponse response)
        {
            return response.StatusCode == 1 &&
                String.Equals(response.StatusSeverity, "Info", StringComparison.OrdinalIgnoreCase);
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
