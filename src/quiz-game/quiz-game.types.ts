export interface Question {
  id: number;
  question: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation: string;
}
