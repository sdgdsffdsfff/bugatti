package models.conf

import actor.ActorUtils
import actor.git.{AddUser, DeleteUser}
import com.github.tototoshi.slick.MySQLJodaSupport._
import com.mysql.jdbc.exceptions.jdbc4.MySQLIntegrityConstraintViolationException
import enums.RoleEnum.Role
import enums.{LevelEnum, RoleEnum}
import exceptions.UniqueNameException
import models.{MaybeFilter, PlayCache}
import org.joda.time.DateTime
import play.api.Logger
import play.api.Play.current
import play.api.cache.Cache
import service.SystemSettingsService._
import utils.LDAPUtil

import scala.language.implicitConversions
import scala.slick.driver.MySQLDriver.simple._
import scala.slick.jdbc.JdbcBackend

/**
 * 用户
 *
 * @author of546
 */
case class User(jobNo: String, name: String, role: Role, password: Option[String], locked: Boolean, lastIp: Option[String], lastVisit: Option[DateTime], sshKey: Option[String])

class UserTable(tag: Tag) extends Table[User](tag, "app_user") {
  def jobNo = column[String]("job_no", O.PrimaryKey, O.DBType("VARCHAR(16)"))
  def name = column[String]("name", O.DBType("VARCHAR(20)"))
  def role = column[Role]("role", O.Default(RoleEnum.user), O.DBType("ENUM('admin', 'user')")) // 用户角色
  def password = column[String]("password", O.Nullable, O.DBType("VARCHAR(256)"))
  def locked = column[Boolean]("locked", O.Default(false), O.DBType("ENUM('y', 'n')"))(MappedColumnType.base[Boolean, String](if(_) "y" else "n",  _ == "y")) // 账号锁定
  def lastIp = column[String]("last_ip", O.Nullable, O.DBType("VARCHAR(40)"))           // 最近登录ip
  def lastVisit = column[DateTime]("last_visit", O.Nullable, O.Default(DateTime.now())) // 最近登录时间
  def sshKey = column[String]("ssh_key", O.Nullable, O.DBType("VARCHAR(1025)"))
  override def * = (jobNo, name, role, password.?, locked, lastIp.?, lastVisit.?, sshKey.?) <> (User.tupled, User.unapply _)

  def idx = index("idx_job_no", jobNo)
}

object UserHelper extends PlayCache {

  implicit def maybeFilterConversor[X,Y](q:Query[X,Y,Seq]) = new MaybeFilter(q)
  import models.AppDB._

  val qUser = TableQuery[UserTable]

  def _cacheNoKey(jobNo: String) = s"user.$jobNo"

  def findByJobNo(jobNo: String): Option[User] = {
    Cache.getAs[User](_cacheNoKey(jobNo.toLowerCase)) match {
      case Some(user) => Some(user)
      case None => db withSession { implicit session =>
        qUser.filter(_.jobNo === jobNo.toLowerCase).firstOption match {
          case Some(user) =>
            Cache.set(_cacheNoKey(jobNo.toLowerCase), user)
            Some(user)
          case None => None
        }
      }
    }
  }

  def count(jobNo: Option[String]): Int = db withSession { implicit session =>
    val query = qUser.filteredBy(jobNo)(u => (u.jobNo like s"%${jobNo.get}%") || (u.name like s"%${jobNo.get}%")).query
    query.length.run
  }

  def all(): Seq[User] = db withSession { implicit session =>
    qUser.list
  }

  def all(jobNo: Option[String], page: Int, pageSize: Int): Seq[User] = db withSession { implicit session =>
    val offset = pageSize * page
    val query = qUser.filteredBy(jobNo)(u => (u.jobNo like s"%${jobNo.get}%") || (u.name like s"%${jobNo.get}%")).query
    query.drop(offset).take(pageSize).list
  }

  def create(user: User) = db withSession { implicit session =>
    _create(user)
  }

  @throws[UniqueNameException]
  def _create(user: User)(implicit session: JdbcBackend#Session) = {
    Cache.remove(_cacheNoKey(user.jobNo.toLowerCase)) // clean cache
    try {
      val create2user = user.password match {
        case Some(pwd) => user.copy(password = Some(play.api.libs.Codecs.sha1(pwd)))
        case None => user
      }
      ActorUtils.keyGit ! AddUser(create2user)
      qUser.insert(create2user)(session)
    } catch {
      case x: MySQLIntegrityConstraintViolationException => throw new UniqueNameException
    }
  }

  def delete(jobNo: String) = db withSession { implicit session =>
    _delete(jobNo)
  }

  def _delete(jobNo: String)(implicit session: JdbcBackend#Session) = {
    Cache.remove(_cacheNoKey(jobNo.toLowerCase)) // clean cache
    ActorUtils.keyGit ! DeleteUser(jobNo)
    qUser.filter(_.jobNo === jobNo.toLowerCase).delete(session)
  }

  def update(jobNo: String, user: User) = db withSession { implicit session =>
    _update(jobNo, user)
  }

  @throws[UniqueNameException]
  def _update(jobNo: String, user: User)(implicit session: JdbcBackend#Session) = {
    val findUser = findByJobNo(jobNo.toLowerCase)
    Cache.remove(_cacheNoKey(jobNo.toLowerCase)) // clean cache
    try {
      val update2user = user.password match {
        case Some(pwd) if findUser.isDefined && user.password.nonEmpty && findUser.get.password != user.password =>
          user.copy(password = Some(play.api.libs.Codecs.sha1(pwd)))
        case _ => user
      }
      qUser.filter(_.jobNo === jobNo.toLowerCase).update(update2user)(session)
    } catch {
      case x: MySQLIntegrityConstraintViolationException => throw new UniqueNameException
    }
  }

  def authenticate(settings: SystemSettings, userName: String, password: String): Option[User] = {
    if (settings.ldapAuthentication) {
      ldapAuthentication(settings, userName, password)
    } else {
      defaultAuthentication(userName, password)
    }
  }

  private def defaultAuthentication(userName: String, password: String) = {
    findByJobNo(userName).collect {
      case user if user.password == Some(play.api.libs.Codecs.sha1(password)) => Some(user)
    } getOrElse None
  }

  private def ldapAuthentication(settings: SystemSettings, userName: String, password: String): Option[User] = {
    LDAPUtil.authenticate(settings.ldap.get, userName, password) match {
      case Right(ldapUserInfo) => {
        findByJobNo(ldapUserInfo.userName) match {
          case Some(user) => {
            if (settings.ldap.get.fullNameAttribute.getOrElse("").isEmpty) {
              update(user.jobNo, user.copy(name = ldapUserInfo.fullName))
            }
          }
          case None =>
            val user = User(jobNo      = ldapUserInfo.userName,
                            name       = ldapUserInfo.fullName,
                            role       = RoleEnum.user,
                            password   = None,
                            locked     = false,
                            lastIp     = None,
                            lastVisit  = None,
                            sshKey     = None)
            create(user)
        }
        findByJobNo(ldapUserInfo.userName)
      }
      case Left(errorMessage) => {
        Logger.info(s"LDAP Authentication Failed: ${errorMessage}")
        defaultAuthentication(userName, password)
      }
    }
  }

  /* 项目成员 */
  def hasProject(projectId: Int, user: User): Boolean = {
    if (admin_?(user)) true
    else ProjectMemberHelper.findByProjectId_JobNo(projectId, user.jobNo) match {
      case Some(member) if member.projectId == projectId => true
      case _ => false
    }
  }

  /* 项目管理员 */
  def hasProjectSafe(projectId: Int, user: User): Boolean = {
    if (admin_?(user)) true
    else ProjectMemberHelper.findByProjectId_JobNo(projectId, user.jobNo) match {
      case Some(member) if member.projectId == projectId && member.level == LevelEnum.safe => true
      case _ => false
    }
  }

  /* 指定环境下，根据安全级别选择委员长或成员访问 */
  def hasProjectInEnv(projectId: Int, envId: Int, user: User): Boolean = {
    if (admin_?(user)) true
    else EnvironmentHelper.findById(envId) match {
      case Some(env) if env.locked =>
        EnvironmentMemberHelper.findByEnvId_JobNo(envId, user.jobNo).nonEmpty
      case Some(env) if !env.locked =>
        ProjectMemberHelper.findByProjectId_JobNo(projectId, user.jobNo) match {
          case Some(member) =>
            if (member.level == LevelEnum.safe) true
            else env.level match {
              case LevelEnum.safe => if (member.level == env.level) true else false
              case LevelEnum.unsafe => true
              case _ => false
            }
          case None => false
        }
      case _ => false
    }
  }

  /* 环境成员 */
  def hasEnv(envId: Int, user: User): Boolean = {
    if (admin_?(user)) true
    else EnvironmentMemberHelper.findByEnvId_JobNo(envId, user.jobNo) match {
      case Some(member) if member.envId == envId => true
      case _ => false
    }
  }

  /* 环境管理员*/
  def hasEnvSafe(envId: Int, user: User): Boolean = {
    if (admin_?(user)) true
    else EnvironmentMemberHelper.findByEnvId_JobNo(envId, user.jobNo) match {
      case Some(member) if member.envId == envId && member.level == LevelEnum.safe => true
      case _ => false
    }
  }

  def admin_?(user: User): Boolean = if (user.role == RoleEnum.admin) true else false

}