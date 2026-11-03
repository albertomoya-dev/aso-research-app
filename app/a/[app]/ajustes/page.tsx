// `/a/[app]/ajustes` opens the first tab, Producto: the same page as `…/ajustes/producto`.
import ProductPage, { metadata } from "./producto/page";

// Segment config is read from this file itself, so it is repeated rather than re-exported.
export const maxDuration = 120;

export { metadata };
export default ProductPage;
