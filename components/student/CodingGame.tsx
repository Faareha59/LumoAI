import React, { useState, useMemo } from 'react';
import Button from '../common/Button';
import { CodeBracketIcon } from '../Icons';

interface Challenge {
  id: number;
  question: string;
  code: string;
  answer: string;
}

const challenges: Challenge[] = [
  { id: 1, question: "What is the output of this JavaScript code?", code: "console.log(1 + '2' + 3);", answer: "123" },
  { id: 2, question: "What will this function return?", code: "const x = () => { let a = 1; return a++; };\nx();", answer: "1" },
  { id: 3, question: "What value is logged to the console?", code: "for(var i=0; i<3; i++) {\n  setTimeout(() => console.log(i), 10);\n}", answer: "333" },
  { id: 4, question: "What is the result of `!!'hello'`?", code: "console.log(!!'hello');", answer: "true" },
];

const CodingGame: React.FC = () => {
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentChallenge = useMemo(() => challenges[currentChallengeIndex], [currentChallengeIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userAnswer.trim().toLowerCase() === currentChallenge.answer.toLowerCase()) {
      setFeedback("Correct! Well done.");
      setTimeout(() => {
        setFeedback(null);
        setUserAnswer('');
        setCurrentChallengeIndex((prev) => (prev + 1) % challenges.length);
      }, 1500);
    } else {
      setFeedback("Not quite. Try again!");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-8">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <CodeBracketIcon className="w-8 h-8 text-muted-foreground" />
          <h1 className="text-3xl font-bold">Coding Challenge</h1>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg text-muted-foreground mb-4">{currentChallenge.question}</h2>
          <pre className="bg-background p-4 rounded-md text-foreground whitespace-pre-wrap font-mono mb-4">
            <code>{currentChallenge.code}</code>
          </pre>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => {
                setUserAnswer(e.target.value);
                setFeedback(null);
              }}
              placeholder="Your answer..."
              className="w-full p-2 bg-background border border-border rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-foreground"
            />
            <Button type="submit" disabled={!userAnswer}>Submit Answer</Button>
          </form>
          {feedback && (
            <p className={`mt-4 text-center font-semibold ${feedback.startsWith('Correct') ? 'text-green-400' : 'text-red-400'}`}>
              {feedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodingGame;