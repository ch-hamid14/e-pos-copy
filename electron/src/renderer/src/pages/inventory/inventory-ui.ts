export const STATUS_COLORS: Record<string, string> = {
  in_stock: 'green',
  sold: 'blue',
  returned: 'orange',
  damaged: 'red',
  in_service: 'purple'
}

export const STATUS_OPTIONS = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'sold', label: 'Sold' },
  // { value: 'returned', label: 'Returned' },
  // { value: 'damaged', label: 'Damaged' },
  // { value: 'in_service', label: 'In Service' }
]

export const ADJUST_STATUS_OPTIONS = [
  { value: 'in_stock', label: 'In Stock' },
  // { value: 'returned', label: 'Returned' },
  // { value: 'damaged', label: 'Damaged' },
  { value: 'in_service', label: 'In Service' }
]
