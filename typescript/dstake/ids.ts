/**
 * Generates a deployment ID for a dSTAKE conversion adapter based on convention.
 * @param adapterBaseName The base name of the adapter contract (e.g., "WrappedDLendConversionAdapter")
 * @param dStableSymbol The symbol of the underlying dStable ("dUSD" or "dS")
 * @param vaultAssetSymbol The symbol of the vault asset (e.g., "wddUSD")
 * @returns The derived deployment ID (e.g., "WrappedDLendConversionAdapter_dUSD")
 */
export const getAdapterId = (
  adapterBaseName: string,
  dStableSymbol: string,
  vaultAssetSymbol: string
): string => {
  return `${adapterBaseName}_${dStableSymbol}`;
};
