import React from 'react';

const Loader: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-card rounded-lg">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
};

export default Loader;