/**
 * Product identifiers shown in the UI and quoted in submission documents.
 *
 * `PRODUCT_CODE` is the GTIN-13 issued for this product by GS1 Korea — the
 * issuance record names it 유통표준코드(GTIN-13), which is the label rendered
 * beside it. The same value serves as the medical-device UDI-DI on the MFDS
 * submission, so it must stay identical everywhere it is displayed. Structure:
 * manufacturer prefix 880039836 + item reference 000 + GS1 check digit 5.
 */
export const PRODUCT_CODE = '8800398360005';
export const PRODUCT_CODE_LABEL = '유통표준코드(GTIN-13)';
