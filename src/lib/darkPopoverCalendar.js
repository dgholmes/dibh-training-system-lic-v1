/** Dark theme classNames for shadcn Calendar inside Popover (registration + patient edit). */

/**
 * react-day-picker's `dropdown-buttons` caption keeps the prev/next arrows and
 * adds month and year `<select>`s. It ships CSS for that in its own
 * stylesheet, which this project does not load — shadcn supplies classNames
 * instead — so the pieces below have to be provided by hand. Without them the
 * selects render as unstyled white boxes and the screen-reader labels print
 * "Month:" / "Year:" over the grid.
 *
 * The arrangement rdp expects: a transparent full-size `<select>` laid over a
 * styled label showing the current value, so the control looks designed while
 * the native picker still handles interaction (and keeps mobile behaviour).
 */
export const darkPopoverCalendarClassNames = {
  caption: 'relative flex items-center justify-center pt-1',
  caption_dropdowns: 'flex items-center gap-1.5',

  // Visible value + chevron. Sits under the transparent select below.
  caption_label:
    'inline-flex items-center gap-1 rounded-md border border-[#30363D] bg-[#252A32] px-2 py-1 text-sm font-medium text-white',

  // The real control, invisible and stretched over its label.
  //
  // The option list is drawn by the browser/WebView, not by us: it takes its
  // colours from the select's computed style, so `text-white` alone left white
  // text on the default white popup. `color-scheme: dark` switches the native
  // control to the dark palette, and the explicit option colours cover WebViews
  // that ignore it.
  dropdown:
    'absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-white opacity-0 [color-scheme:dark] [&>option]:bg-[#1C2128] [&>option]:text-white',
  dropdown_month: 'relative inline-flex items-center',
  dropdown_year: 'relative inline-flex items-center',

  // rdp's own accessible labels ("Month:", "Year:") — hidden, not deleted.
  vhidden: 'sr-only',

  head_cell: 'text-[#8B949E]',
  day_selected:
    'bg-[#3B82F6] text-white hover:bg-[#2563EB] hover:text-white focus:bg-[#3B82F6]',
  day_today: 'bg-[#30363D] text-white',
  day_outside: 'text-[#6E7681] opacity-60',
};
