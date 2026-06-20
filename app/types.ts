export type QuestionOption = {
  id: "A" | "B" | "C" | "D";
  text: string;
};

export type QuizQuestion = {
  id: string;
  area: string;
  theme: string;
  statement: string;
  explanation: string;
  options: QuestionOption[];
  correctOptionId: QuestionOption["id"];
};

export type RoomStatus = "active" | "finished";

export type OnlineRoom = {
  id: string;
  roomCode: string;
  roomName: string | null;
  releasedQuestionIds: string[];
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type UbsTeam = {
  id: string;
  roomId: string;
  name: string;
  memberCount: number;
  averageScore: number;
  answeredCount: number;
  createdAt: string;
};

export type Student = {
  id: string;
  roomId: string;
  ubsId: string;
  nickname: string;
  avatarId: string | null;
  totalScore: number;
  answeredCount: number;
  joinedAt: string;
  lastActivityAt: string;
};

export type StudentAnswer = {
  id: string;
  roomId: string;
  studentId: string;
  questionId: string;
  selectedOptionId: QuestionOption["id"] | "TIMEOUT";
  isCorrect: boolean;
  usedHint: boolean;
  score: number;
  answeredAt: string;
};

export type QuestionTimer = {
  roomId: string;
  studentId: string;
  questionId: string;
  startedAt: string;
};

export type RoomPublicState = {
  room: OnlineRoom;
  ubsTeams: UbsTeam[];
  students: Student[];
};

export type StudentSessionState = {
  room: OnlineRoom;
  ubsTeam: UbsTeam;
  student: Student;
  answers: StudentAnswer[];
};

export type CreateRoomResult = {
  room: OnlineRoom;
  adminKey: string;
};

export type RoomAdminAccessResult = {
  room: OnlineRoom;
  adminKey: string;
};

export type ProfessorRoomSummary = {
  room: OnlineRoom;
  studentCount: number;
  ubsCount: number;
  averageTeamScore: number;
  lastActivityAt: string | null;
};

export type QuestionOptionStat = {
  optionId: QuestionOption["id"] | "TIMEOUT";
  count: number;
  percent: number;
  isCorrect: boolean;
};

export type QuestionStats = {
  questionId: string;
  totalAnswers: number;
  correctCount: number;
  incorrectCount: number;
  timeoutCount: number;
  options: QuestionOptionStat[];
};

export type StudentQuestionStat = {
  questionId: string;
  theme: string;
  selectedOptionId: QuestionOption["id"] | "TIMEOUT";
  correctOptionId: QuestionOption["id"];
  isCorrect: boolean;
  score: number;
  answeredAt: string;
};

export type StudentStats = {
  student: Student;
  ubsName: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  timeoutCount: number;
  totalScore: number;
  averageScore: number;
  answers: StudentQuestionStat[];
};
