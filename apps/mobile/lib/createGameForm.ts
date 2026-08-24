export type CreateGameType = '1v1' | 'Group';

export type CreateGameFormField =
  | 'level'
  | 'date'
  | 'time'
  | 'location'
  | 'title'
  | 'description'
  | 'payment';

export type CreateGameFormError = {
  field: CreateGameFormField;
  message: string;
};

export type CreateGameFormValues = {
  level: string;
  date: string;
  time: string;
  locationName: string;
  hasKnownLocation: boolean;
  type: CreateGameType;
  title: string;
  description: string;
  isPaid: boolean;
  paymentAmount: number;
};

export function getCreateGameFormError(
  values: CreateGameFormValues
): CreateGameFormError | null {
  if (!values.level) {
    return { field: 'level', message: 'Please select a level' };
  }
  if (!values.date) {
    return { field: 'date', message: 'Please select a date' };
  }
  if (!values.time) {
    return { field: 'time', message: 'Please select a time' };
  }
  if (!values.locationName.trim()) {
    return { field: 'location', message: 'Please enter a location' };
  }
  if (!values.hasKnownLocation) {
    return { field: 'location', message: 'Please select a location from the list' };
  }
  if (values.type === 'Group' && !values.title.trim()) {
    return { field: 'title', message: 'Please enter a title' };
  }
  if (!values.description.trim()) {
    return { field: 'description', message: 'Please enter a description' };
  }
  if (values.isPaid && !(values.paymentAmount > 0)) {
    return { field: 'payment', message: 'Please enter an amount per player' };
  }
  return null;
}
