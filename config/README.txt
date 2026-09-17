이 폴더는 설치본에 함께 들어갑니다.

여기에 apikey.txt 파일을 만들고 Gemini API 키를 한 줄로 적어 두면,
설치한 사람이 설정 창에서 키를 넣지 않아도 바로 쓸 수 있습니다.

예)
  echo "AIza...여기에키..." > config/apikey.txt

주의: 설치본 안의 키는 추출이 가능합니다. 가족용으로만 쓰시고
공개 배포에는 사용하지 마세요. (apikey.txt 는 .gitignore 에 들어 있습니다)
