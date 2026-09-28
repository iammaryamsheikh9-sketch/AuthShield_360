const getAuthPhase = () => {
  const configuredPhase = Number(process.env.AUTH_PHASE || 1);
  return [1, 2, 3].includes(configuredPhase) ? configuredPhase : 1;
};

export default getAuthPhase;